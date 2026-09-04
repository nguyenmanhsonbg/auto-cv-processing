import { useState, useEffect, useCallback } from 'react';
import { fetchProvinces, fetchDistricts, type Province, type District } from './location.service';
import { TrashIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon } from '@/assets/icons';

export interface LocationEntry {
  id: string;
  province_id: number;
  province_name: string;
  addresses: Array<{
    district_id: number;
    district_name: string;
    working_address: string;
  }>;
}

interface TopCvLocationPickerProps {
  value: LocationEntry[];
  onChange: (locations: LocationEntry[]) => void;
}

export function TopCvLocationPicker({ value, onChange }: TopCvLocationPickerProps) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<Record<number, District[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedAreas, setCollapsedAreas] = useState<Record<number, boolean>>({});

  // Load provinces on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchProvinces();
        setProvinces(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải danh sách tỉnh/thành phố');
        setLoading(false);
      }
    })();
  }, []);

  // Fetch districts for a given province ID
  const loadDistrictsForProvince = useCallback(async (provinceId: number) => {
    if (!provinceId || districts[provinceId]) return;
    try {
      const data = await fetchDistricts(provinceId);
      setDistricts((prev) => ({ ...prev, [provinceId]: data }));
    } catch (err) {
      console.error(`Failed to load districts for province ${provinceId}:`, err);
    }
  }, [districts]);

  // Load districts for all provinces currently in value
  useEffect(() => {
    value.forEach((loc) => {
      if (loc.province_id && !districts[loc.province_id]) {
        void loadDistrictsForProvince(loc.province_id);
      }
    });
  }, [value, districts, loadDistrictsForProvince]);

  const addArea = () => {
    const newArea: LocationEntry = {
      id: String(Date.now()),
      province_id: 0,
      province_name: '',
      addresses: [
        {
          district_id: 0,
          district_name: '',
          working_address: '',
        },
      ],
    };
    onChange([...value, newArea]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const removeArea = (areaIdx: number) => {
    onChange(value.filter((_, i) => i !== areaIdx));
  };

  const toggleCollapse = (areaIdx: number) => {
    setCollapsedAreas((prev) => ({ ...prev, [areaIdx]: !prev[areaIdx] }));
  };

  const handleProvinceChange = (areaIdx: number, newProvinceId: number) => {
    const province = provinces.find((p) => p.id === newProvinceId);
    if (!province) return;

    void loadDistrictsForProvince(province.id);

    const next = [...value];
    next[areaIdx] = {
      ...next[areaIdx],
      province_id: province.id,
      province_name: province.name,
      addresses: [
        {
          district_id: 0,
          district_name: '',
          working_address: '',
        },
      ],
    };
    onChange(next);
  };

  const handleDistrictChange = (areaIdx: number, addrIdx: number, newDistrictId: number) => {
    const provinceId = value[areaIdx]?.province_id;
    const currentDistricts = districts[provinceId] || [];
    const district = currentDistricts.find((d) => d.id === newDistrictId);

    const next = [...value];
    const nextAddrs = [...(next[areaIdx]?.addresses || [])];
    nextAddrs[addrIdx] = {
      ...nextAddrs[addrIdx],
      district_id: newDistrictId,
      district_name: district ? (district.title || district.name) : '',
    };
    next[areaIdx] = { ...next[areaIdx], addresses: nextAddrs };
    onChange(next);
  };

  const handleAddressTextChange = (areaIdx: number, addrIdx: number, text: string) => {
    const next = [...value];
    const nextAddrs = [...(next[areaIdx]?.addresses || [])];
    nextAddrs[addrIdx] = {
      ...nextAddrs[addrIdx],
      working_address: text,
    };
    next[areaIdx] = { ...next[areaIdx], addresses: nextAddrs };
    onChange(next);
  };

  const addAddress = (areaIdx: number) => {
    const next = [...value];
    const currentAddrs = next[areaIdx]?.addresses || [];
    next[areaIdx] = {
      ...next[areaIdx],
      addresses: [
        ...currentAddrs,
        {
          district_id: 0,
          district_name: '',
          working_address: '',
        },
      ],
    };
    onChange(next);
  };

  const removeAddress = (areaIdx: number, addrIdx: number) => {
    const next = [...value];
    next[areaIdx] = {
      ...next[areaIdx],
      addresses: next[areaIdx].addresses.filter((_, i) => i !== addrIdx),
    };
    onChange(next);
  };

  if (loading) {
    return (
      <div className="location-picker-loading">
        <span className="topcv-spinner" />
        <span>Đang tải danh sách tỉnh/thành phố...</span>
      </div>
    );
  }

  if (error) {
    return <div className="location-picker-error">{error}</div>;
  }

  return (
    <div className="topcv-location-picker">
      {/* Header row: Địa điểm làm việc * & Xóa tất cả khu vực */}
      <div className="topcv-location-header">
        <span className="topcv-form-label" style={{ marginBottom: 0 }}>
          Địa điểm làm việc <span className="req" style={{ color: '#dc2626' }}>*</span>
        </span>
        {value.length > 0 && (
          <button
            type="button"
            className="topcv-location-clear-all"
            onClick={handleClearAll}
            title="Xóa tất cả khu vực"
          >
            <TrashIcon className="topcv-location-trash-icon" />
            <span>Xóa tất cả khu vực</span>
          </button>
        )}
      </div>

      {/* Areas List */}
      {value.length > 0 && (
        <div className="topcv-location-areas-list">
          {value.map((loc, areaIdx) => {
            const isCollapsed = collapsedAreas[areaIdx] ?? false;
            const currentDistricts = districts[loc.province_id] || [];
            const addresses = loc.addresses && loc.addresses.length > 0
              ? loc.addresses
              : [{ district_id: 0, district_name: '', working_address: '' }];

            return (
              <div key={loc.id || areaIdx} className="topcv-location-area-card">
                {/* Area Header */}
                <div className="topcv-location-area-header">
                  <button
                    type="button"
                    className="topcv-location-collapse-btn"
                    onClick={() => toggleCollapse(areaIdx)}
                    title={isCollapsed ? 'Mở rộng khu vực' : 'Thu gọn khu vực'}
                    aria-label={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                  >
                    {isCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
                  </button>

                  <span className="topcv-location-area-title">
                    Khu vực {areaIdx + 1}:
                  </span>

                  <div className="topcv-location-province-select-wrap">
                    <select
                      className="topcv-location-province-select"
                      value={loc.province_id || ''}
                      onChange={(e) => handleProvinceChange(areaIdx, Number(e.target.value))}
                    >
                      <option value="" disabled selected>Lựa chọn khu vực</option>
                      {provinces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="topcv-location-select-arrow" />
                  </div>

                  {value.length > 1 && (
                    <button
                      type="button"
                      className="topcv-location-remove-area-btn"
                      onClick={() => removeArea(areaIdx)}
                      title="Xóa khu vực này"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>

                {/* Area Content (Addresses) */}
                {!isCollapsed && (
                  <div className="topcv-location-area-body">
                    <div className="topcv-location-addresses-list">
                      {addresses.map((addr, addrIdx) => (
                        <div key={addrIdx} className="topcv-location-address-row">
                          <div className="topcv-location-district-select-wrap">
                            <select
                              className="topcv-location-district-select"
                              value={addr.district_id || ''}
                              onChange={(e) => handleDistrictChange(areaIdx, addrIdx, Number(e.target.value))}
                            >
                              <option value="" disabled selected>Lựa chọn phường/xã</option>
                              {currentDistricts.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.title || d.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDownIcon className="topcv-location-select-arrow" />
                          </div>

                          <div className="topcv-location-address-input-wrap">
                            <input
                              type="text"
                              className="topcv-location-address-input"
                              placeholder="Nhập địa chỉ cụ thể"
                              value={addr.working_address || ''}
                              onChange={(e) => handleAddressTextChange(areaIdx, addrIdx, e.target.value)}
                            />
                          </div>

                          {addresses.length > 1 && (
                            <button
                              type="button"
                              className="topcv-location-remove-address-btn"
                              onClick={() => removeAddress(areaIdx, addrIdx)}
                              title="Xóa địa chỉ"
                              aria-label="Xóa địa chỉ"
                            >
                              <CloseIcon />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="topcv-location-add-sub-btn"
                      onClick={() => addAddress(areaIdx)}
                    >
                      <span className="topcv-location-plus-icon"><PlusIcon /></span>
                      <span>Thêm Phường/Xã</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Button Thêm khu vực */}
      <button
        type="button"
        className="topcv-location-add-area-btn"
        onClick={addArea}
      >
        <span className="topcv-location-plus-icon"><PlusIcon /></span>
        <span>Thêm khu vực</span>
      </button>
    </div>
  );
}
