import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import math
from shapely.geometry import Polygon, LineString
import requests
from datetime import datetime
import time

from ultralytics import YOLO


# ------------------- API CONFIG -------------------
# Defaults to the deployed backend. Override locally with:
# WATER_LEVEL_API_URL=http://localhost:8000/api/water-levels
API_URL = os.getenv(
    "WATER_LEVEL_API_URL",
    "https://gaganadapat.onrender.com/api/water-levels",
).rstrip("/")

CAMERA_ID = "cam_1"


# ------------------- STATUS LEVELS -------------------
# below warningLevel = SAFE
# warningLevel to below DANGER_LEVEL = WARNING
# DANGER_LEVEL and above = DANGER
DANGER_LEVEL = 10


# ------------------- RENDER-SAFE SEND SETTINGS -------------------
# Minimum time between normal sends.
# Recommended for Render: 5 to 10 seconds.
SEND_INTERVAL = 5

# If the water level changes less than this, do not send yet.
# This prevents saving tiny YOLO flickers like 8.01, 8.02, 8.03 nonstop.
MIN_LEVEL_CHANGE_TO_SEND = 0.10

# Even if the value is stable, send once every 30 seconds
# so the backend/dashboard/Unity knows the camera is still alive.
HEARTBEAT_INTERVAL = 30

last_sent = 0
last_sent_level = None
last_sent_status = None


# ------------------- OUTPUT / PERFORMANCE SETTINGS -------------------
# Turn this off for deployment if you do not need saved video.
# Recording every frame can slow the machine and consume disk.
SAVE_OUTPUT_VIDEO = False


# ------------------- RTSP / VIDEO CONFIG -------------------
# Helps reduce RTSP delay in OpenCV + FFMPEG.
# TCP is usually more stable for CCTV. UDP can be faster but may drop frames.
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|"
    "fflags;nobuffer|"
    "flags;low_delay|"
    "max_delay;0"
)

WINDOW_NAME = "YOLOv8 Inference"


# ------------------- CCTV STABILITY SETTINGS -------------------
# Higher = less delay, but display may look choppier.
RTSP_GRAB_FRAMES = 8

# Reconnect after this many failed reads.
MAX_FAILED_READS = 5

# Reconnect if the same/near-same frame repeats too long.
FROZEN_FRAME_LIMIT = 15

# Lower = more sensitive frozen-frame detection.
# If it reconnects too much, increase to 2.5 or 3.0.
FRAME_DIFF_THRESHOLD = 1.5

last_frame_gray = None
frozen_frame_count = 0
failed_read_count = 0


# ------------------- CALIBRATION -------------------
clicked_points = []
line_ready = False


def mouse_callback(event, x, y, flags, param):
    global clicked_points, line_ready

    if event == cv2.EVENT_LBUTTONDOWN:
        # Prevent more than 2 points.
        # This avoids crash when user clicks more than twice.
        if len(clicked_points) >= 2:
            return

        clicked_points.append((x, y))
        print("Clicked:", x, y)

        if len(clicked_points) == 2:
            line_ready = True
            print("Calibration line ready.")


# ------------------- STATUS HELPERS -------------------
def get_water_status(distance, warningLevel):
    if distance >= DANGER_LEVEL:
        return "DANGER"

    if distance >= warningLevel:
        return "WARNING"

    return "SAFE"


def get_status_color(status):
    if status == "DANGER":
        return (255, 0, 0)      # red

    if status == "WARNING":
        return (255, 165, 0)    # orange

    return (0, 255, 0)          # green


# ------------------- SEND DATA -------------------
def send_to_backend(distance, warningLevel):
    global last_sent, last_sent_level, last_sent_status

    now = time.time()

    rounded_distance = round(distance, 2)
    status = get_water_status(rounded_distance, warningLevel)

    level_changed_enough = (
        last_sent_level is None or
        abs(rounded_distance - last_sent_level) >= MIN_LEVEL_CHANGE_TO_SEND
    )

    status_changed = (
        last_sent_status is None or
        status != last_sent_status
    )

    heartbeat_due = (
        last_sent == 0 or
        now - last_sent >= HEARTBEAT_INTERVAL
    )

    normal_interval_due = (
        last_sent == 0 or
        now - last_sent >= SEND_INTERVAL
    )

    # Render-safe rule:
    # Send if:
    # 1. status changed, send immediately
    # 2. level changed enough AND normal interval passed
    # 3. heartbeat interval passed
    should_send = (
        status_changed or
        (level_changed_enough and normal_interval_due) or
        heartbeat_due
    )

    if not should_send:
        return

    last_sent = now
    last_sent_level = rounded_distance
    last_sent_status = status

    data = {
        "water_level": rounded_distance,
        "warning_level": warningLevel,
        "danger_level": DANGER_LEVEL,
        "status": status,
        "camera_id": CAMERA_ID,
        "timestamp": datetime.utcnow().isoformat()
    }

    try:
        response = requests.post(API_URL, json=data, timeout=5)

        if response.status_code >= 200 and response.status_code < 300:
            print("Sent:", data)
        else:
            print("Backend rejected data:", response.status_code, response.text)

    except Exception as e:
        print("Error sending:", e)


# ------------------- HELPER FUNCTIONS -------------------
def is_rtsp_stream(video_path):
    if not isinstance(video_path, str):
        return False

    return video_path.lower().startswith("rtsp://")


def create_capture(video_path):
    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)

    # Lower buffer reduces delay for CCTV/RTSP.
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    # These may not work on every OpenCV build, but safe to keep.
    try:
        cap.set(cv2.CAP_PROP_FPS, 30)
    except Exception:
        pass

    return cap


def load_font(size=45):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        print("arial.ttf not found. Using default font.")
        return ImageFont.load_default()


def get_valid_fps(cap):
    fps = cap.get(cv2.CAP_PROP_FPS)

    if fps is None or fps <= 0 or math.isnan(fps):
        fps = 20

    return fps


def get_frame_size(cap):
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if width <= 0:
        width = 1280

    if height <= 0:
        height = 720

    return width, height


def get_latest_frame(cap, video_path):
    """
    For normal video files:
        read normally.

    For RTSP:
        grab multiple frames before retrieve to reduce CCTV delay.
        This drops old buffered CCTV frames and tries to process newer frames.
    """

    if is_rtsp_stream(video_path):
        grabbed = False

        for _ in range(RTSP_GRAB_FRAMES):
            grabbed = cap.grab()

        if not grabbed:
            return False, None

        success, frame = cap.retrieve()
        return success, frame

    success, frame = cap.read()
    return success, frame


def is_frame_frozen(frame):
    """
    Detects if CCTV is returning the same/stale frame repeatedly.
    If frozen, the system should reconnect and skip backend sending.
    """

    global last_frame_gray, frozen_frame_count

    if frame is None:
        return True

    try:
        small = cv2.resize(frame, (160, 90))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    except Exception:
        return True

    if last_frame_gray is None:
        last_frame_gray = gray
        frozen_frame_count = 0
        return False

    diff = cv2.absdiff(last_frame_gray, gray)
    mean_diff = np.mean(diff)

    last_frame_gray = gray

    if mean_diff < FRAME_DIFF_THRESHOLD:
        frozen_frame_count += 1
    else:
        frozen_frame_count = 0

    return frozen_frame_count >= FROZEN_FRAME_LIMIT


def reconnect_capture(cap, video_path):
    global last_frame_gray, frozen_frame_count, failed_read_count

    print("🔄 Reconnecting CCTV stream...")

    try:
        cap.release()
    except Exception:
        pass

    time.sleep(0.5)

    last_frame_gray = None
    frozen_frame_count = 0
    failed_read_count = 0

    new_cap = create_capture(video_path)

    if not new_cap.isOpened():
        print("❌ Reconnect failed. Retrying...")
        time.sleep(1)

    return new_cap


def extract_intersection_points(intersection):
    """
    Shapely intersection can return:
    - Point
    - MultiPoint
    - LineString
    - MultiLineString
    - GeometryCollection

    This normalizes it into a list of usable points.
    """

    points = []

    if intersection.is_empty:
        return points

    geom_type = intersection.geom_type

    if geom_type == "Point":
        points.append((intersection.x, intersection.y))

    elif geom_type == "MultiPoint":
        for point in intersection.geoms:
            points.append((point.x, point.y))

    elif geom_type == "LineString":
        coords = list(intersection.coords)

        if len(coords) > 0:
            points.append(coords[0])

        if len(coords) > 1:
            points.append(coords[-1])

    elif geom_type == "MultiLineString":
        for line in intersection.geoms:
            coords = list(line.coords)

            if len(coords) > 0:
                points.append(coords[0])

            if len(coords) > 1:
                points.append(coords[-1])

    elif geom_type == "GeometryCollection":
        for geom in intersection.geoms:
            points.extend(extract_intersection_points(geom))

    return points


def choose_nearest_point_to_start(points, x1, y1):
    """
    Keeps your original logic:
    distance is calculated from the first clicked point to the water intersection.

    If there are multiple intersection points, choose the nearest one to point 1.
    """

    if not points:
        return None

    best_point = None
    best_distance = None

    for px, py in points:
        dist = math.sqrt((px - x1) ** 2 + (py - y1) ** 2)

        if best_distance is None or dist < best_distance:
            best_distance = dist
            best_point = (px, py)

    return best_point


def get_best_water_polygon(results):
    """
    Keeps the main logic the same, but safer:
    instead of blindly using masks.xy[0], choose the largest valid mask.

    This helps when YOLO detects multiple water regions.
    """

    if results[0].masks is None:
        return None

    if results[0].masks.xy is None:
        return None

    if len(results[0].masks.xy) == 0:
        return None

    best_polygon = None
    best_area = 0

    for mask_xy in results[0].masks.xy:
        if mask_xy is None or len(mask_xy) < 3:
            continue

        polygon_vertices = [(int(x), int(y)) for x, y in mask_xy]

        try:
            poly = Polygon(polygon_vertices)

            if not poly.is_valid:
                poly = poly.buffer(0)

            if poly.is_empty:
                continue

            area = poly.area

            if area > best_area:
                best_area = area
                best_polygon = poly

        except Exception:
            continue

    return best_polygon


# ------------------- MAIN YOLO FUNCTION -------------------
def yolo(video_path, pixelsInAMeter, tipHeight, warningLevel):
    global clicked_points, line_ready, failed_read_count

    model = YOLO("best.pt")

    cap = create_capture(video_path)

    if not cap.isOpened():
        print("❌ Error: Cannot open video")
        return

    fps = get_valid_fps(cap)
    frame_width, frame_height = get_frame_size(cap)

    output_video = None

    if SAVE_OUTPUT_VIDEO:
        output_video = cv2.VideoWriter(
            "Output Video.mp4",
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (frame_width, frame_height)
        )

    myFont = load_font(45)

    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, mouse_callback)

    def calculateDistance(x1, y1, x2, y2):
        return tipHeight - (math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / pixelsInAMeter)

    print("Controls:")
    print("Left click: set 2 calibration points")
    print("R: reset calibration")
    print("Q: quit")
    print("Status:")
    print(f"SAFE: below {warningLevel}m")
    print(f"WARNING: {warningLevel}m to below {DANGER_LEVEL}m")
    print(f"DANGER: {DANGER_LEVEL}m and above")
    print("Render-safe sending:")
    print(f"SEND_INTERVAL: {SEND_INTERVAL}s")
    print(f"MIN_LEVEL_CHANGE_TO_SEND: {MIN_LEVEL_CHANGE_TO_SEND}m")
    print(f"HEARTBEAT_INTERVAL: {HEARTBEAT_INTERVAL}s")
    print("CCTV stability:")
    print(f"RTSP_GRAB_FRAMES: {RTSP_GRAB_FRAMES}")
    print(f"MAX_FAILED_READS: {MAX_FAILED_READS}")
    print(f"FROZEN_FRAME_LIMIT: {FROZEN_FRAME_LIMIT}")
    print(f"FRAME_DIFF_THRESHOLD: {FRAME_DIFF_THRESHOLD}")

    # ------------------- LOOP -------------------
    while True:
        success, frame = get_latest_frame(cap, video_path)

        if not success or frame is None:
            failed_read_count += 1
            print(f"⚠️ Stream read failed ({failed_read_count}/{MAX_FAILED_READS})")

            if failed_read_count >= MAX_FAILED_READS:
                cap = reconnect_capture(cap, video_path)

            continue

        failed_read_count = 0

        if is_rtsp_stream(video_path) and is_frame_frozen(frame):
            print("⚠️ CCTV frame appears frozen/stale. Reconnecting and skipping detection/send...")
            cap = reconnect_capture(cap, video_path)
            continue

        # Make sure frame size matches VideoWriter size.
        current_height, current_width = frame.shape[:2]

        if current_width != frame_width or current_height != frame_height:
            frame = cv2.resize(frame, (frame_width, frame_height))

        # For CCTV, lower conf helps with compressed/blurry stream.
        # If false detections happen, raise conf to 0.35 or 0.45.
        results = model(frame, imgsz=640, conf=0.25, verbose=False)

        annotated_frame = results[0].plot()

        pil_image = Image.fromarray(cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(pil_image)

        if not line_ready:
            draw.text(
                (50, 50),
                "CLICK 2 POINTS TO SET LINE",
                font=myFont,
                fill=(255, 255, 0)
            )

            if len(clicked_points) == 1:
                px, py = clicked_points[0]
                draw.ellipse((px - 6, py - 6, px + 6, py + 6), fill=(255, 255, 0))
                draw.text(
                    (50, 105),
                    "CLICK SECOND POINT",
                    font=myFont,
                    fill=(255, 255, 0)
                )

        else:
            if len(clicked_points) == 2:
                (x1, y1), (x2, y2) = clicked_points

                draw.line([(x1, y1), (x2, y2)], fill=(255, 255, 0), width=3)

                water_polygon = get_best_water_polygon(results)

                line = LineString([(x1, y1), (x2, y2)])

                if water_polygon is not None:
                    try:
                        intersection = water_polygon.intersection(line)
                        intersection_points = extract_intersection_points(intersection)

                        chosen_point = choose_nearest_point_to_start(
                            intersection_points,
                            x1,
                            y1
                        )

                        if chosen_point is not None:
                            inter_x, inter_y = chosen_point

                            draw.line(
                                [(x1, y1), (inter_x, inter_y)],
                                fill=(0, 255, 0),
                                width=3
                            )

                            distance = calculateDistance(inter_x, inter_y, x1, y1)

                            # Avoid weird negative readings from imperfect calibration/detection.
                            if distance < 0:
                                distance = 0

                            status = get_water_status(distance, warningLevel)
                            status_color = get_status_color(status)

                            # Dynamic text position instead of hardcoded 900/1000.
                            status_x = max(30, frame_width - 430)
                            level_x = max(30, frame_width - 430)

                            draw.text(
                                (status_x, 50),
                                status,
                                font=myFont,
                                fill=status_color
                            )

                            draw.text(
                                (level_x, 105),
                                f"{round(distance, 2)}m",
                                font=myFont,
                                fill=(0, 0, 0)
                            )

                            draw.text(
                                (level_x, 160),
                                f"WARN: {warningLevel}m | DANGER: {DANGER_LEVEL}m",
                                font=myFont,
                                fill=(0, 0, 0)
                            )

                            send_to_backend(distance, warningLevel)

                    except Exception as e:
                        print("Intersection error:", e)

        result_frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

        cv2.imshow(WINDOW_NAME, result_frame)

        if output_video is not None:
            output_video.write(result_frame)

        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break

        if key == ord("r"):
            clicked_points = []
            line_ready = False
            print("Calibration reset")

    cap.release()

    if output_video is not None:
        output_video.release()

    cv2.destroyAllWindows()


# ------------------- AUTO RUN -------------------
if __name__ == "__main__":
    print("🚀 Starting YOLO Water Level System...")

    # For normal video file:
    video_path = r"C:\Users\OwelMt\Desktop\Mob_Ver\logic2\media\Fixed Hikuwai.mp4"

    # For CCTV RTSP:
    # video_path = "rtsp://admin:superstrong12@192.168.1.64:554/Streaming/Channels/102"

    pixelsInAMeter = 15
    tipHeight = 15

    # Since DANGER starts at 10m, WARNING should be lower than 10.
    warningLevel = 8

    yolo(video_path, pixelsInAMeter, tipHeight, warningLevel)
