import { useEffect, useState, useMemo } from 'react';
import { fetchJobFamilies, buildJobFamilyPath, type JobFamily, type JobFamilyPath } from './job-families.service';
import { ChevronDownIcon } from '@/components/icons';

interface TopCvJobFamilyPickerProps {
  initialLevel3Id?: number;
  selectedPathName?: string;
  onChange: (path: JobFamilyPath | null) => void;
  onClose?: () => void;
  error?: string | null;
}

interface FlattenedJobFamily {
  level1: JobFamily;
  level2: JobFamily;
  level3: JobFamily;
}

export function TopCvJobFamilyPicker({ initialLevel3Id, selectedPathName, onChange, onClose, error = null }: TopCvJobFamilyPickerProps) {
  const [data, setData] = useState<JobFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [hoveredL1, setHoveredL1] = useState<JobFamily | null>(null);
  const [hoveredL2, setHoveredL2] = useState<JobFamily | null>(null);
  const [selectedL3, setSelectedL3] = useState<JobFamily | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const families = await fetchJobFamilies();
        if (!mounted) return;
        setData(families);

        // Set initial value if provided
        if (initialLevel3Id) {
          const path = buildJobFamilyPath(initialLevel3Id, families);
          if (path) {
            setHoveredL1(path.level1);
            setHoveredL2(path.level2);
            setSelectedL3(path.level3);
          }
        }
        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        setFetchError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu vị trí chuyên môn');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [initialLevel3Id]);

  // Flatten for search
  const flattenedList = useMemo<FlattenedJobFamily[]>(() => {
    const list: FlattenedJobFamily[] = [];
    for (const l1 of data) {
      for (const l2 of l1.children ?? []) {
        for (const l3 of l2.children ?? []) {
          list.push({ level1: l1, level2: l2, level3: l3 });
        }
      }
    }
    return list;
  }, [data]);

  // Search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return flattenedList.filter(
      (item) =>
        item.level3.name.toLowerCase().includes(q) ||
        item.level2.name.toLowerCase().includes(q) ||
        item.level1.name.toLowerCase().includes(q)
    );
  }, [searchQuery, flattenedList]);

  const handleSelectL3 = (l1: JobFamily, l2: JobFamily, l3: JobFamily) => {
    setSelectedL3(l3);
    setHoveredL1(l1);
    setHoveredL2(l2);
    const path = buildJobFamilyPath(l3.id, data);
    onChange(path);
    setIsOpen(false);
    onClose?.();
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleHoverL1 = (item: JobFamily) => {
    setHoveredL1(item);
    // If current hoveredL2 does not belong to this L1, reset it
    if (hoveredL2 && !item.children?.some((c) => c.id === hoveredL2.id)) {
      setHoveredL2(null);
    }
  };

  const handleHoverL2 = (item: JobFamily) => {
    setHoveredL2(item);
  };

  const displayValue = selectedL3
    ? selectedL3.name
    : selectedPathName || '';

  const l2List = hoveredL1?.children ?? [];
  const l3List = hoveredL2?.children ?? [];

  return (
    <div className="topcv-family-field-wrap">
      <label className="topcv-form-label">
        Vị trí chuyên môn <span className="req" style={{ color: '#dc2626' }}>*</span>
      </label>

      {/* Trigger Button in Form */}
      <button
        type="button"
        className={`topcv-family-trigger-btn ${displayValue ? 'has-value' : ''} ${error ? 'has-error' : ''}`}
        onClick={() => setIsOpen(true)}
      >
        <span className="topcv-family-trigger-text">
          {displayValue || 'Chọn vị trí chuyên môn'}
        </span>
        <span className="topcv-family-trigger-arrow">
          <ChevronDownIcon />
        </span>
      </button>
      {error ? <p className="input-field-error">{error}</p> : null}

      {/* Modal Dialog Overlay */}
      {isOpen && (
        <div className="topcv-family-modal-overlay" onClick={handleClose}>
          <div className="topcv-family-modal-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Header with Title & Close Icon */}
            <div className="topcv-family-header">
              <h3 className="topcv-family-title">Chọn vị trí chuyên môn</h3>
              <button
                type="button"
                className="topcv-family-close-btn"
                onClick={handleClose}
                title="Đóng"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <div className="topcv-loading-row">
                <span className="topcv-spinner" />
                <span>Đang tải danh sách vị trí chuyên môn...</span>
              </div>
            ) : fetchError ? (
              <div className="topcv-field-error">{fetchError}</div>
            ) : (
              <>
                {/* Search Bar */}
                <div className="topcv-family-search-wrap">
                  <div className="topcv-family-search-box">
                    <span className="topcv-family-search-icon">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 14L11.1 11.1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      className="topcv-family-search-input"
                      placeholder="Tìm kiếm theo vị trí, ngành nghề"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="topcv-family-search-clear"
                        onClick={() => setSearchQuery('')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Search results or 3-column view */}
                {searchQuery.trim().length > 0 ? (
                  <div className="topcv-family-search-results">
                    {searchResults.length === 0 ? (
                      <div className="topcv-family-search-empty">
                        Không tìm thấy vị trí chuyên môn phù hợp với "{searchQuery}"
                      </div>
                    ) : (
                      <div className="topcv-family-search-list">
                        {searchResults.map((res) => {
                          const isSelected = selectedL3?.id === res.level3.id;
                          return (
                            <button
                              key={`${res.level1.id}-${res.level2.id}-${res.level3.id}`}
                              type="button"
                              className={`topcv-family-search-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                handleSelectL3(res.level1, res.level2, res.level3);
                                setSearchQuery('');
                              }}
                            >
                              <span className="topcv-family-search-name">{res.level3.name}</span>
                              <span className="topcv-family-search-path">
                                {res.level1.name} › {res.level2.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="topcv-family-columns-grid">
                    {/* Column 1: NHÓM NGHỀ */}
                    <div className="topcv-family-column topcv-family-col-l1">
                      <div className="topcv-family-col-title">NHÓM NGHỀ</div>
                      <div className="topcv-family-col-items">
                        {data.map((item) => {
                          const isActive = hoveredL1?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              className={`topcv-family-row-item ${isActive ? 'active' : ''}`}
                              onMouseEnter={() => handleHoverL1(item)}
                              onClick={() => handleHoverL1(item)}
                            >
                              <span className="topcv-family-item-name">{item.name}</span>
                              <span className="topcv-family-item-arrow">
                                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Column 2: NGHỀ */}
                    <div className="topcv-family-column topcv-family-col-l2">
                      <div className="topcv-family-col-title">NGHỀ</div>
                      <div className="topcv-family-col-items">
                        {!hoveredL1 ? (
                          <div className="topcv-family-col-empty">Chọn nhóm nghề</div>
                        ) : (
                          l2List.map((item) => {
                            const isActive = hoveredL2?.id === item.id;
                            return (
                              <div
                                key={item.id}
                                className={`topcv-family-row-item ${isActive ? 'active' : ''}`}
                                onMouseEnter={() => handleHoverL2(item)}
                                onClick={() => handleHoverL2(item)}
                              >
                                <span className="topcv-family-item-name">{item.name}</span>
                                <span className="topcv-family-item-arrow">
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Column 3: CHUYÊN MÔN */}
                    <div className="topcv-family-column topcv-family-col-l3">
                      <div className="topcv-family-col-title">CHUYÊN MÔN</div>
                      {hoveredL1 && hoveredL2 ? (
                        <div className="topcv-family-l3-content">
                          <h4 className="topcv-family-l2-heading">{hoveredL2.name}</h4>

                          {/* Banner notice */}
                          <div className="topcv-family-notice-box">
                            <span className="topcv-family-notice-icon">
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="10" cy="10" r="9" fill="#3B82F6" />
                                <path d="M7 8.5V11.5H8.5L12 14V6L8.5 8.5H7Z" fill="white" />
                                <path d="M13.5 8C14.2 8.6 14.5 9.3 14.5 10C14.5 10.7 14.2 11.4 13.5 12" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                              </svg>
                            </span>
                            <div className="topcv-family-notice-text">
                              Sau khi chọn <strong>Chuyên môn</strong> thuộc <strong>{hoveredL1.name}</strong>, có thể chọn <strong>Hình thức bán hàng</strong>: Telesales, Direct sales,...
                            </div>
                          </div>

                          {/* Chips list for Level 3 */}
                          <div className="topcv-family-chips-grid">
                            {l3List.map((item) => {
                              const isSelected = selectedL3?.id === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`topcv-family-chip ${isSelected ? 'selected' : ''}`}
                                  onClick={() => handleSelectL3(hoveredL1, hoveredL2, item)}
                                >
                                  {item.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="topcv-family-empty-state">
                          <div className="topcv-family-empty-icon-wrap">
                            <svg width="48" height="48" viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="42" cy="42" r="38" fill="#F3F4F6" />
                              <rect x="26" y="34" width="32" height="24" rx="4" fill="#E5E7EB" />
                              <path d="M34 34V30C34 28.8954 34.8954 28 36 28H48C49.1046 28 50 28.8954 50 30V34" stroke="#00B14F" strokeWidth="2.5" strokeLinecap="round" />
                              <circle cx="50" cy="48" r="10" fill="white" stroke="#00B14F" strokeWidth="2.5" />
                              <path d="M57 55L65 63" stroke="#00B14F" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          </div>
                          <p className="topcv-family-empty-text">Hãy chọn vị trí chuyên môn phù hợp</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
