type PaginationProps = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({ page, limit, total, totalPages, onPageChange, className = '' }: PaginationProps) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const start = ((safePage - 1) * safeLimit) + 1;
  const end = Math.min(safePage * safeLimit, total);
  const classes = ['shared-pagination', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <span>Hiển thị từ {start} - {end} của {total} kết quả</span>
      <div>
        <button
          type="button"
          className="secondary-button"
          aria-label="Trang trước"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          ‹
        </button>
        <strong>{safePage} / {Math.max(1, totalPages)}</strong>
        <button
          type="button"
          className="secondary-button"
          aria-label="Trang sau"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
