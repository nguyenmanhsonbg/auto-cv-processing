import { useState } from 'react';
import { DateRangeFilter, FilterBar, MultiSelectFilter, SearchField, SelectFilter } from '@/components/filters';
import type { DateRangeValue, SelectFilterOption } from '@/components/filters';

export type FreelancerCvStatusFilter = 'ALL' | 'PROCESSING' | 'PASSED' | 'REJECTED';

export type FreelancerCvFilterValues = {
  search: string;
  status: FreelancerCvStatusFilter;
  jd: string;
  dateRange: DateRangeValue;
};

type FreelancerCvFiltersProps = {
  value: FreelancerCvFilterValues;
  statusOptions: SelectFilterOption[];
  jdOptions: SelectFilterOption[];
  onChange: (value: FreelancerCvFilterValues) => void;
};

export function FreelancerCvFilters({ value, statusOptions, jdOptions, onChange }: FreelancerCvFiltersProps) {
  const [isJdFilterOpen, setIsJdFilterOpen] = useState(false);

  return (
    <FilterBar className="freelancer-cv-toolbar">
      <SearchField
        className="freelancer-cv-search"
        value={value.search}
        onChange={(search) => onChange({ ...value, search })}
        placeholder="Tìm kiếm CV theo tên ứng viên, vị trí ứng tuyển"
        ariaLabel="Tìm kiếm CV theo tên ứng viên, vị trí ứng tuyển"
        maxLength={255}
      />
      <SelectFilter label="Tình trạng CV" value={value.status} options={statusOptions} onChange={(status) => onChange({ ...value, status: status as FreelancerCvFilterValues['status'] })} />
      <MultiSelectFilter
        label="Lọc theo JD"
        allLabel="Tất cả JD"
        values={value.jd === 'ALL' ? [] : [value.jd]}
        options={jdOptions.filter((option) => option.value !== 'ALL')}
        isOpen={isJdFilterOpen}
        onToggle={() => setIsJdFilterOpen((current) => !current)}
        onClose={() => setIsJdFilterOpen(false)}
        onChange={(values) => onChange({ ...value, jd: values[0] ?? 'ALL' })}
      />
      <DateRangeFilter value={value.dateRange} onChange={(dateRange) => onChange({ ...value, dateRange })} />
    </FilterBar>
  );
}
