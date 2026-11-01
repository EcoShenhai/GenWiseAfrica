const TZ = 'Africa/Nairobi';
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
export const fmtKes = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`;
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
export const ago = (d) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
};
/** Value for <input type="datetime-local"> from a Date, in local time */
export const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', instructor: 'Instructor', mentor: 'Mentor', prayer_leader: 'Prayer leader', learner: 'Learner' };
export const MEETING_LABEL = { live_class: 'Live class', mentorship_session: 'Mentorship session', prayer_meeting: 'Prayer meeting', webinar: 'Webinar', fellowship: 'Fellowship' };
export const TYPE_LABEL = { church: 'Church', ministry: 'Ministry', mentor: 'Independent mentor', organisation: 'Organisation' };
