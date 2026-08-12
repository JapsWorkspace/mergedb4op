import React, { useState } from "react";
import axios from "axios";
import {
  CONTENT_PRIORITY_OPTIONS,
  CONTENT_STATUS_OPTIONS,
  MAX_CONTENT_DESCRIPTION_LENGTH,
  MAX_CONTENT_TITLE_LENGTH,
  sanitizeContentChoice,
  sanitizeContentDescription,
  sanitizeContentDescriptionInput,
  sanitizeContentTitle,
  sanitizeContentTitleInput,
  validateContentFields
} from "../contentTextUtils";

export default function UpdateGuideline({ guideline, onClose, onUpdated }) {
const categoryOptions = ["earthquake", "flood", "typhoon", "general"];
const [title, setTitle] = useState(sanitizeContentTitle(guideline.title));
const [description, setDescription] = useState(
  sanitizeContentDescription(guideline.description)
);
const [category, setCategory] = useState(
  sanitizeContentChoice(guideline.category, categoryOptions, "general")
);
const [status, setStatus] = useState(
  sanitizeContentChoice(guideline.status, CONTENT_STATUS_OPTIONS, "draft")
);
const [priorityLevel, setPriorityLevel] = useState(
  sanitizeContentChoice(guideline.priorityLevel, CONTENT_PRIORITY_OPTIONS, "medium")
);

const BASE_URL = process.env.REACT_APP_API_URL || "https://gaganadapat.onrender.com";

const updateGuideline = async () => {
try {
const validationError = validateContentFields(title, description);

if (validationError) {
  alert(validationError);
  return;
}

const response = await axios.put(`${BASE_URL}${guideline._id}`, {
title: sanitizeContentTitle(title),
description: sanitizeContentDescription(description),
category,
status,
priorityLevel
});

  alert("Guideline updated successfully!");
  onUpdated(response.data);
  onClose();

} catch (error) {
  console.error(error.response?.data || error.message);
  alert("Failed to update guideline.");
}

}

return ( <div style={styles.overlay}> <div style={styles.modal}> <h2>Update Guideline</h2>

    <input
      style={styles.input}
      value={title}
      onChange={(e) => setTitle(sanitizeContentTitleInput(e.target.value))}
      onBlur={(e) => setTitle(sanitizeContentTitle(e.target.value))}
      maxLength={MAX_CONTENT_TITLE_LENGTH}
    />

    <textarea
      style={styles.input}
      value={description}
      onChange={(e) => setDescription(sanitizeContentDescriptionInput(e.target.value))}
      onBlur={(e) => setDescription(sanitizeContentDescription(e.target.value))}
      maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
    />

    <select
      style={styles.input}
      value={category}
      onChange={(e) =>
        setCategory(
          sanitizeContentChoice(e.target.value, categoryOptions, "general")
        )
      }
    >
      {categoryOptions.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>

    <select
      style={styles.input}
      value={status}
      onChange={(e) =>
        setStatus(
          sanitizeContentChoice(e.target.value, CONTENT_STATUS_OPTIONS, "draft")
        )
      }
    >
      {CONTENT_STATUS_OPTIONS.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>

    <select
      style={styles.input}
      value={priorityLevel}
      onChange={(e) =>
        setPriorityLevel(
          sanitizeContentChoice(
            e.target.value,
            CONTENT_PRIORITY_OPTIONS,
            "medium"
          )
        )
      }
    >
      {CONTENT_PRIORITY_OPTIONS.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>

    <button style={styles.button} onClick={updateGuideline}>
      Update
    </button>

    <button style={styles.cancel} onClick={onClose}>
      Cancel
    </button>
  </div>
</div>

);
}

const styles = {
overlay: {
position: "fixed",
top: 0,
left: 0,
width: "100%",
height: "100%",
backgroundColor: "rgba(0,0,0,0.5)",
display: "flex",
justifyContent: "center",
alignItems: "center"
},
modal: {
background: "white",
padding: 20,
borderRadius: 10,
width: 400
},
input: {
width: "100%",
padding: 10,
marginBottom: 10
},
button: {
backgroundColor: "#007bff",
color: "white",
padding: 10,
border: "none",
marginRight: 10,
cursor: "pointer"
},
cancel: {
backgroundColor: "#6c757d",
color: "white",
padding: 10,
border: "none",
cursor: "pointer"
}
}
