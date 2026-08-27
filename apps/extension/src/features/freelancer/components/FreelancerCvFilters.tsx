import { useState } from 'react';
import { DateRangeFilter, FilterBar, MultiSelectFilter, SearchField, SelectFilter } from '@/components/filters';
import type { DateRangeValue, MultiSelectFilterOption, SelectFilterOption } from '@/components/filters';
import { CloseIcon } from '@/components/icons';
import { limitFreelancerCvSearchInput, normalizeFreelancerCvSearch } from '../freelancer-cv-filter-utils';

export type FreelancerCvStatusFilter = string;

export type FreelancerCvFilterValues = {
  search: string;
  status: FreelancerCvStatusFilter;
  jd: string[];
  dateRange: DateRangeValue;
};

type FreelancerCvFiltersProps = {
  value: FreelancerCvFilterValues;
  statusOptions: SelectFilterOption[];
  jdOptions: MultiSelectFilterOption[];
  statusDisabled?: boolean;
  onChange: (value: FreelancerCvFilterValues) => void;
};

export function FreelancerCvFilters({ value, statusOptions, jdOptions, statusDisabled = false, onChange }: FreelancerCvFiltersProps) {
  const [isJdFilterOpen, setIsJdFilterOpen] = useState(false);

  return (
    <FilterBar className="freelancer-cv-toolbar">
      <SearchField
        className="freelancer-cv-search"
        value={value.search}
        onChange={(search) => onChange({ ...value, search: limitFreelancerCvSearchInput(search) })}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const normalizedSearch = normalizeFreelancerCvSearch(value.search);
          if (normalizedSearch !== value.search) onChange({ ...value, search: normalizedSearch });
        }}
        placeholder="Tìm kiếm CV theo tên ứng viên, vị trí ứng tuyển"
        ariaLabel="Tìm kiếm CV theo tên ứng viên, vị trí ứng tuyển"
        clearButton={
          value.search ? (
            <button
              type="button"
              className="clear-button"
              aria-label="Xóa tìm kiếm"
              onClick={() => onChange({ ...value, search: '' })}
            >
              <CloseIcon />
            </button>
          ) : null
        }
      />
      <SelectFilter label="Tình trạng CV" value={value.status} options={statusOptions} disabled={statusDisabled} onChange={(status) => onChange({ ...value, status: status as FreelancerCvFilterValues['status'] })} />
      <MultiSelectFilter
        className="freelancer-cv-jd-filter"
        label="Lọc theo JD"
        allLabel="Tất cả JD"
        values={value.jd}
        options={jdOptions.filter((option) => option.value !== 'ALL')}
        isOpen={isJdFilterOpen}
        onToggle={() => setIsJdFilterOpen((current) => !current)}
        onClose={() => setIsJdFilterOpen(false)}
        onChange={(values) => onChange({ ...value, jd: values })}
      />
      <DateRangeFilter value={value.dateRange} onChange={(dateRange) => onChange({ ...value, dateRange })} />
    </FilterBar>
  );
}
