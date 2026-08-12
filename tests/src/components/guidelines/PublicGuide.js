import { useEffect, useMemo, useState } from "react";
import {
  FaBookOpen,
  FaEye,
  FaFilter,
  FaImage,
  FaSearch,
  FaTimes
} from "react-icons/fa";
import "../css/Guidelines.css";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;
const GUIDELINES_URL = `${BASE_URL}/api/guidelines`;

const normalize = (value) => String(value || "").trim().toLowerCase();

const formatLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "-";

const PRIORITY_ORDER = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const sortGuidelines = (items = []) =>
  [...items].sort((a, b) => {
    const priorityDiff =
      (PRIORITY_ORDER[b?.priorityLevel] || 0) -
      (PRIORITY_ORDER[a?.priorityLevel] || 0);

    if (priorityDiff !== 0) return priorityDiff;

    return (
      new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
    );
  });

const getPriorityTone = (priority) => {
  const value = normalize(priority);
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
};

export default function PublicGuide() {
  const [guidelines, setGuidelines] = useState([]);
  const [filteredGuidelines, setFilteredGuidelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedGuideline, setSelectedGuideline] = useState(null);

  const categories = useMemo(
    () => ["all", "earthquake", "flood", "typhoon", "general"],
    []
  );

  useEffect(() => {
    fetchGuidelines();
  }, [selectedCategory]);

  useEffect(() => {
    applySearch(searchText, guidelines);
  }, [searchText, guidelines]);

  const fetchGuidelines = async () => {
    try {
      setLoading(true);

      let url = `${GUIDELINES_URL}?status=published`;
      if (selectedCategory !== "all") {
        url += `&category=${selectedCategory}`;
      }

      const response = await fetch(url, {
        credentials: "include"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to fetch guidelines");
      }

      const next = Array.isArray(data) ? sortGuidelines(data) : [];
      setGuidelines(next);
      setFilteredGuidelines(next);
    } catch (error) {
      console.error("Error fetching guidelines:", error);
      setGuidelines([]);
      setFilteredGuidelines([]);
    } finally {
      setLoading(false);
    }
  };

  const applySearch = (text, source = guidelines) => {
    setSearchText(text);

    if (!text.trim()) {
      setFilteredGuidelines(source);
      setSuggestions([]);
      return;
    }

    const query = text.toLowerCase();

    const filtered = source.filter((item) => {
      const title = item?.title || "";
      const description = item?.description || "";
      const category = item?.category || "";
      const priority = item?.priorityLevel || "";

      return (
        title.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        category.toLowerCase().includes(query) ||
        priority.toLowerCase().includes(query)
      );
    });

    setFilteredGuidelines(filtered);
    setSuggestions(filtered.map((item) => item.title).slice(0, 5));
  };

  const selectSuggestion = (title) => {
    setSearchText(title);
    setSuggestions([]);
    applySearch(title, guidelines);
  };

  const handleViewGuideline = async (item) => {
    try {
      const response = await fetch(`${GUIDELINES_URL}/view/${item._id}`, {
        method: "PATCH",
        credentials: "include"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to update views");
      }

      setGuidelines((prev) =>
        prev.map((row) => (row._id === item._id ? data : row))
      );

      setFilteredGuidelines((prev) =>
        prev.map((row) => (row._id === item._id ? data : row))
      );

      setSelectedGuideline(data);
    } catch (error) {
      console.error("Error incrementing view:", error);
      setSelectedGuideline(item);
    }
  };

  const renderAttachments = (attachments = [], compact = false) => {
    if (!attachments.length) return null;

    return (
      <div className="gl-public-attachments">
        <div className="gl-public-attachment-head">
          <span>
            <FaImage />
            Attachments
          </span>
        </div>

        <div className={`gl-public-attachment-grid ${compact ? "compact" : ""}`}>
          {attachments.map((file, idx) =>
            file?.fileUrl ? (
              <img
                key={`${file?.public_id || file?.fileUrl || idx}`}
                src={file.fileUrl}
                alt={file.fileName || `Attachment ${idx + 1}`}
                className={compact ? "gl-public-thumb" : "gl-public-image"}
              />
            ) : null
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="gl-page">
        <div className="gl-shell">
          <section className="gl-header-card">
            <div className="gl-header-main">
              <h1 className="gl-header-title">Disaster Guidelines</h1>
            </div>
          </section>

          <section className="gl-card">
            <div className="gl-empty-state">Loading guidelines...</div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="gl-page">
      <div className="gl-shell">
        <section className="gl-header-card">
          <div className="gl-header-head">
            <div className="gl-header-main">
              <h1 className="gl-header-title">Disaster Guidelines</h1>
              <div className="gl-title-meta">
                <span className="gl-top-pill">
                  <FaBookOpen />
                  Public Information
                </span>
                <span className="gl-top-pill subtle">
                  Clear, searchable, and low-clutter
                </span>
              </div>
            </div>
          </div>

          <div className="gl-public-toolbar">
            <div className="gl-public-search-wrap">
              <FaSearch className="gl-public-search-icon" />
              <input
                type="text"
                className="gl-public-search"
                placeholder="Search guidelines..."
                value={searchText}
                onChange={(e) => applySearch(e.target.value)}
              />
            </div>

            <div className="gl-public-filter-box">
              <div className="gl-public-filter-title">
                <FaFilter />
                <span>Category</span>
              </div>

              <div className="gl-chip-row">
                {categories.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    className={`gl-filter-chip ${
                      selectedCategory === cat ? "active" : ""
                    }`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {formatLabel(cat)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {suggestions.length > 0 ? (
            <div className="gl-public-suggestions">
              {suggestions.map((title, idx) => (
                <button
                  type="button"
                  key={`${title}-${idx}`}
                  className="gl-public-suggestion"
                  onClick={() => selectSuggestion(title)}
                >
                  {title}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="gl-card">
          {filteredGuidelines.length > 0 ? (
            <div className="gl-list-grid">
              {filteredGuidelines.map((item) => {
                const priorityTone = getPriorityTone(item?.priorityLevel);

                return (
                  <article
                    key={item._id}
                    className="gl-item-card gl-item-published gl-public-item-card"
                    onClick={() => handleViewGuideline(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleViewGuideline(item);
                      }
                    }}
                  >
                    <div className="gl-item-top">
                      <div className="gl-item-main">
                        <div className="gl-item-title">{item.title || "-"}</div>

                        <div className="gl-item-meta">
                          <span className="gl-item-badge">
                            {formatLabel(item.category)}
                          </span>
                          <span className={`gl-item-badge ${priorityTone}`}>
                            {formatLabel(item.priorityLevel)}
                          </span>
                        </div>
                      </div>

                      <div className="gl-item-views">
                        <FaEye />
                        <strong>{Number(item?.views || 0)}</strong>
                      </div>
                    </div>

                    <p className="gl-item-description">
                      {item?.description
                        ? item.description.length > 200
                          ? `${item.description.slice(0, 200)}...`
                          : item.description
                        : "-"}
                    </p>

                    {item.attachments?.length > 0 ? (
                      <div className="gl-public-inline-preview">
                        {item.attachments.slice(0, 3).map((file, index) =>
                          file?.fileUrl ? (
                            <img
                              key={`${file?.public_id || file?.fileUrl || index}`}
                              src={file.fileUrl}
                              alt={file.fileName || `Attachment ${index + 1}`}
                              className="gl-thumb"
                            />
                          ) : null
                        )}
                        {item.attachments.length > 3 ? (
                          <div className="gl-thumb-more">
                            +{item.attachments.length - 3}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="gl-empty-state">No published guidelines found.</div>
          )}
        </section>
      </div>

      {selectedGuideline ? (
        <div className="gl-modal-backdrop">
          <div className="gl-modal-card gl-public-modal">
            <div className="gl-public-modal-head">
              <div>
                <h3>{selectedGuideline.title}</h3>
                <div className="gl-item-meta gl-public-modal-meta">
                  <span className="gl-item-badge">
                    {formatLabel(selectedGuideline.category)}
                  </span>
                  <span
                    className={`gl-item-badge ${getPriorityTone(
                      selectedGuideline.priorityLevel
                    )}`}
                  >
                    {formatLabel(selectedGuideline.priorityLevel)}
                  </span>
                  <span className="gl-item-badge status-published">
                    {formatLabel(selectedGuideline.status)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="gl-btn gl-btn-secondary gl-btn-small"
                onClick={() => setSelectedGuideline(null)}
              >
                <FaTimes />
                Close
              </button>
            </div>

            <div className="gl-public-stat-row">
              <div className="gl-public-stat">
                <span>Views</span>
                <strong>{Number(selectedGuideline?.views || 0)}</strong>
              </div>
            </div>

            {selectedGuideline.description ? (
              <div className="gl-remarks-box">
                <p>{selectedGuideline.description}</p>
              </div>
            ) : null}

            {renderAttachments(selectedGuideline.attachments, false)}
          </div>
        </div>
      ) : null}
    </div>
  );
}