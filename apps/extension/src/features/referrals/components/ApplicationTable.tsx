import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReferralManagementApplication, ReferralManagementSource } from '@/types/types';
import { formatDate } from '@/lib/utils';

function normalizeAmisStageName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .trim();
}

function getApplicationStatus(application: ReferralManagementApplication) {
  const currentStageName = application.currentAmisStage?.recruitmentRoundName?.trim();
  const normalizedStageName = normalizeAmisStageName(currentStageName);

  if (application.statusCategory === 'REJECTED' || application.currentAmisStage?.amisStatus === 0) {
    return { label: 'Loại', className: 'is-rejected' };
  }
  if (application.statusCategory === 'PASSED' || normalizedStageName.includes('DA TUYEN')) {
    return { label: 'Đã tuyển', className: 'is-passed' };
  }
  if (currentStageName) {
    return { label: currentStageName, className: 'is-processing' };
  }
  if (application.hrReceptionStatus === 'REJECT' || application.processStatus === 'HR_REJECTED') {
    return { label: 'Loại', className: 'is-rejected' };
  }
  if (
    application.hrReceptionStatus === 'APPROVE' ||
    application.hrReceptionStatus === 'TALENT_POOL' ||
    application.processStatus === 'HR_APPROVED' ||
    application.processStatus === 'TALENT_POOL'
  ) {
    return { label: 'Đã tuyển', className: 'is-passed' };
  }
  if (application.processStatus === 'WAITING_HR_REVIEW') return { label: 'Chờ', className: 'is-waiting' };
  if (application.processStatus?.includes('FORM') || application.processStatus?.includes('SCREENING')) {
    return { label: 'Trao đổi', className: 'is-processing' };
  }
  return { label: 'Chờ', className: 'is-waiting' };
}

function StatusPill({ application }: { application: ReferralManagementApplication }) {
  const { label, className } = getApplicationStatus(application);
  return <span className={`referral-status-pill ${className}`}><i />{label}</span>;
}

export interface ApplicationTableProps {
  applications: ReferralManagementApplication[];
  source: ReferralManagementSource;
}

export function ApplicationTable({ applications, source }: ApplicationTableProps) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({ scrollLeft: 0, maxScroll: 0, ratio: 0, canScroll: false, thumbWidthPercent: 40 });
  const isDraggingTableRef = useRef(false);
  const isDraggingThumbRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const updateScrollState = useCallback(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const ratio = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
    const thumbWidthPercent = el.scrollWidth > 0 ? Math.max(20, Math.min(100, (el.clientWidth / el.scrollWidth) * 100)) : 100;
    setScrollState({
      scrollLeft: el.scrollLeft,
      maxScroll,
      ratio,
      canScroll,
      thumbWidthPercent,
    });
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = tableWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateScrollState());
    observer.observe(el);
    return () => observer.disconnect();
  }, [applications, updateScrollState]);

  if (applications.length === 0) return <div className="referral-empty-detail">Chưa tải lên CV nào</div>;

  function handleScroll() {
    updateScrollState();
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!tableWrapRef.current) return;
    const canScrollVertically = tableWrapRef.current.scrollHeight > tableWrapRef.current.clientHeight + 2;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scrollState.canScroll && !canScrollVertically) {
      tableWrapRef.current.scrollLeft += e.deltaY;
    }
  }

  function handleTableMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!tableWrapRef.current) return;
    isDraggingTableRef.current = true;
    startXRef.current = e.pageX;
    startScrollLeftRef.current = tableWrapRef.current.scrollLeft;
  }

  function handleTableMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDraggingTableRef.current || !tableWrapRef.current) return;
    e.preventDefault();
    const deltaX = e.pageX - startXRef.current;
    tableWrapRef.current.scrollLeft = startScrollLeftRef.current - deltaX;
  }

  function handleTableMouseUpOrLeave() {
    isDraggingTableRef.current = false;
  }

  function handleTrackMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!trackRef.current || !tableWrapRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    tableWrapRef.current.scrollLeft = clickRatio * scrollState.maxScroll;
  }

  function handleThumbMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    isDraggingThumbRef.current = true;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = tableWrapRef.current?.scrollLeft ?? 0;

    function handleMouseMove(moveEvent: MouseEvent) {
      if (!isDraggingThumbRef.current || !trackRef.current || !tableWrapRef.current) return;
      const trackWidth = trackRef.current.clientWidth;
      const thumbWidth = (scrollState.thumbWidthPercent / 100) * trackWidth;
      const maxThumbTravel = trackWidth - thumbWidth;
      if (maxThumbTravel <= 0) return;

      const deltaX = moveEvent.clientX - startXRef.current;
      const scrollDelta = (deltaX / maxThumbTravel) * scrollState.maxScroll;
      tableWrapRef.current.scrollLeft = startScrollLeftRef.current + scrollDelta;
    }

    function handleMouseUp() {
      isDraggingThumbRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  const thumbLeftPercent = scrollState.ratio * (100 - scrollState.thumbWidthPercent);

  return (
    <div className="referral-application-table-container">
      <div
        ref={tableWrapRef}
        className="referral-table-wrap"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onMouseDown={handleTableMouseDown}
        onMouseMove={handleTableMouseMove}
        onMouseUp={handleTableMouseUpOrLeave}
        onMouseLeave={handleTableMouseUpOrLeave}
      >
        <table className="referral-application-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>CV</th>
              <th>JD</th>
              <th>Tình trạng xử lý</th>
              <th>Thời gian nộp CV</th>
              <th>TA quản lý</th>
              <th>{source === 'INTERNAL' ? 'Ghi chú của Nhân sự nội bộ' : 'Ghi chú của Freelancer'}</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application, index) => (
              <tr key={application.applicationId}>
                <td>{String(index + 1).padStart(2, '0')}</td>
                <td>{application.candidate.fullName}</td>
                <td>{application.jobPosting.title}</td>
                <td><StatusPill application={application} /></td>
                <td>{formatDate(application.appliedAt)}</td>
                <td>{application.assignees.map((assignee) => assignee.name).join(', ') || '—'}</td>
                <td>{application.evaluation || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {scrollState.canScroll ? (
        <div className="referral-table-scrollbar-row">
          <div
            ref={trackRef}
            className="referral-custom-scrollbar-track"
            onMouseDown={handleTrackMouseDown}
            role="scrollbar"
            aria-valuenow={Math.round(scrollState.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="referral-custom-scrollbar-thumb"
              style={{
                width: `${scrollState.thumbWidthPercent}%`,
                left: `${thumbLeftPercent}%`,
              }}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
