// Dashboard: who is in today, at a glance. Loads on its own and shows nothing
// when attendance cannot be read, so it can never break the dashboard.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RiArrowRightSLine, RiCalendarCheckLine } from '@remixicon/react';
import { attendanceAPI, daySummary, todayIST } from '../../lib/hr';
import '../../pages/HR.css';

export function TodayAttendanceView({ summary, onOpen }) {
  const s = summary;
  const stats = [['good', s.in.length, 'in'], ['warn', s.late.length, 'late'], ['mute', s.notMarked.length, 'not marked'], ['brand', s.onLeave.length, 'on leave']];
  return (
    <button type="button" className="mac-card card-link hr-dash" onClick={onOpen}
      aria-label={`Today’s attendance: ${stats.map(([, n, l]) => `${n} ${l}`).join(', ')}. Open Attendance`}>
      <span className="hr-dash-title"><RiCalendarCheckLine size={18} aria-hidden="true" style={{ color: 'var(--brand)' }} />Today’s attendance{s.off && <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>Office closed</span>}</span>
      <span className="hr-dash-stats">
        {stats.map(([tone, n, l]) => <span key={l} className="hr-dash-stat"><span className={`hr-dot ${tone}`} aria-hidden="true" /><b>{n}</b>{l}</span>)}
      </span>
      <RiArrowRightSLine size={18} aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
    </button>
  );
}

export default function TodayAttendance() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let live = true;
    const today = todayIST();
    attendanceAPI.team(today.slice(0, 7))
      .then(rows => { if (live && rows.length) setSummary(daySummary(rows, today)); })
      .catch(() => { /* not available — the card stays hidden */ });
    return () => { live = false; };
  }, []);
  if (!summary || !summary.total) return null;
  return <TodayAttendanceView summary={summary} onOpen={() => navigate('/attendance')} />;
}
