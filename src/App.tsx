import { useState, useEffect, useRef, useCallback } from 'react';
import logoSrc from './assets/logo-removebg.png';
import { dbGet, dbSet, dbGetAll } from './api';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Player {
  id: string; name: string; email: string; phone: string;
  day: string; age: string; position: string; pass: string;
  createdAt: number; isMock?: boolean;
}
interface Organizer { id: string; name: string; email: string; pass: string; createdAt: number; }
interface Team { name: string; color: string; playerIds: string[]; }
interface Draft { teams: Team[]; pool: string[]; }
interface Game {
  id: string; type: 'game' | 'event'; date: string; time: string;
  location: string; notes: string; title?: string;
  teamA?: number; teamB?: number; scoreA?: number; scoreB?: number;
  rsvps?: Record<string, 'yes' | 'no'>;
}
interface ChatMsg { id: string; name: string; message: string; ts: number; }
interface Session { type: 'player' | 'organizer'; id: string; name: string; email: string; }
type View = 'home' | 'public' | 'signup' | 'login' | 'dashboard' | 'organizer';

// ─── Constants ───────────────────────────────────────────────────────────────
const TEAM_DEFS: Team[] = [
  { name: 'Riptide', color: '#e8823a', playerIds: [] },
  { name: 'Undertow', color: '#2c7a8c', playerIds: [] },
  { name: 'Tidebreakers', color: '#0d2136', playerIds: [] },
  { name: 'Sandstorm', color: '#c9a24a', playerIds: [] },
  { name: 'Salt Flats', color: '#6db8c7', playerIds: [] },
  { name: 'Shorebreak', color: '#b2472e', playerIds: [] },
];

const MOCK_FIRST = ['Mia','Jordan','Casey','Avery','Riley','Sam','Dakota','Skyler','Quinn','Reese','Emerson','Rowan','Kai','Sage','Blake','Devon','Micah','Parker','Elliot','Marlow'];
const MOCK_LAST = ['Rivera','Nakamura','Odom','Bennett','Castillo','Fletcher','Okafor','Sung','Delgado','Marsh','Whitfield','Torres','Lindgren','Abara','Voss'];
const MOCK_POSITIONS = ['Quarterback','Receiver','Rusher','Flex / Either',''];
const MOCK_DAYS = ['Saturday','Sunday','Either','Other'];
const GRADES = ['7th grade','8th grade','9th grade','10th grade','11th grade','12th grade'];

// ─── Utils ───────────────────────────────────────────────────────────────────
const uid = () => 'p_' + Math.random().toString(36).slice(2, 10);

// Local-only fallback (used only for chat state inside OrganizerBoard)
function loadLocal<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveLocal(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return '';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDateBlock(date: string, time: string) {
  if (!date) return { weekday: '', day: '--', month: '', time: '' };
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return { weekday: '', day: '--', month: '', time: '' };
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    day: d.getDate(),
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    time: fmtTime(time),
  };
}
function hasFinalScore(g: Game) {
  return typeof g.scoreA === 'number' && g.scoreA >= 0 && typeof g.scoreB === 'number' && g.scoreB >= 0;
}

// ─── Standings logic ─────────────────────────────────────────────────────────
function computeStandings(teams: Team[], games: Game[]) {
  const rows = teams.map((team, index) => ({ team, index, played: 0, wins: 0, losses: 0, ties: 0, for: 0, against: 0, points: 0 }));
  games.filter(hasFinalScore).forEach(g => {
    const a = rows[g.teamA!], b = rows[g.teamB!];
    if (!a || !b) return;
    a.played++; b.played++;
    a.for += g.scoreA!; a.against += g.scoreB!;
    b.for += g.scoreB!; b.against += g.scoreA!;
    if (g.scoreA! > g.scoreB!) { a.wins++; b.losses++; a.points += 2; }
    else if (g.scoreB! > g.scoreA!) { b.wins++; a.losses++; b.points += 2; }
    else { a.ties++; b.ties++; a.points++; b.points++; }
  });
  return rows.sort((a, b) => b.points - a.points || ((b.for - b.against) - (a.for - a.against)) || b.for - a.for || a.team.name.localeCompare(b.team.name));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Nav
function Nav({ session, view, setView, onLogout }: {
  session: Session | null; view: View;
  setView: (v: View) => void; onLogout: () => void;
}) {
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--navy)', borderBottom: '3px solid var(--orange)' }}
      className="flex items-center justify-between px-4 md:px-7 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <img src={logoSrc} alt="Beach Football League" style={{ width: 46, height: 46, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.4))' }} />
        <span style={{ fontFamily: 'Anton, sans-serif', color: 'var(--cream)', fontSize: '1rem', letterSpacing: '0.5px', whiteSpace: 'nowrap' }} className="hidden sm:inline">Beach Football League</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {session ? (
          <>
            <span style={{ color: 'var(--teal-light)', fontSize: '0.78rem', marginRight: 4 }} className="hidden sm:inline">
              {session.type === 'organizer' ? `Organizer: ${session.name}` : session.name}
            </span>
            {session.type === 'player' && (
              <NavBtn active={view === 'dashboard'} onClick={() => setView('dashboard')}>Dashboard</NavBtn>
            )}
            {session.type === 'organizer' && (
              <NavBtn active={view === 'organizer'} onClick={() => setView('organizer')}>Draft Board</NavBtn>
            )}
            <NavBtn active={view === 'public'} onClick={() => setView('public')}>Home</NavBtn>
            <NavBtn active={false} onClick={onLogout}>Log Out</NavBtn>
          </>
        ) : (
          <>
            <NavBtn active={view === 'home'} onClick={() => setView('home')}>Home</NavBtn>
            <NavBtn active={view === 'public'} onClick={() => setView('public')}>League</NavBtn>
            <NavBtn active={view === 'signup'} onClick={() => setView('signup')}>Sign Up</NavBtn>
            <NavBtn active={view === 'login'} onClick={() => setView('login')}>Log In</NavBtn>
          </>
        )}
      </div>
    </nav>
  );
}

function NavBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--orange)' : 'transparent',
      color: active ? 'var(--navy)' : 'var(--sand)',
      border: 'none', padding: '7px 14px', borderRadius: 999,
      fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >{children}</button>
  );
}

// Hero / Home
function HomeView({ setView }: { setView: (v: View) => void }) {
  return (
    <div>
      <div style={{
        background: 'radial-gradient(ellipse 900px 500px at 50% 85%, rgba(232,130,58,0.55), transparent 70%), linear-gradient(180deg, #0a1826 0%, #0d2136 45%, #1d4462 100%)',
        padding: '72px 24px 120px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 140,
          background: 'radial-gradient(circle at 50% 250px, rgba(232,130,58,0.7) 0, rgba(232,130,58,0.7) 90px, transparent 92px)',
          opacity: 0.45, pointerEvents: 'none' }} />
        <img src={logoSrc} alt="Beach Football League" style={{ width: 180, height: 180, objectFit: 'contain', margin: '0 auto 8px', display: 'block', position: 'relative', filter: 'drop-shadow(0 8px 32px rgba(232,130,58,0.45))' }} />
        <h1 style={{ fontFamily: 'Anton, sans-serif', color: 'var(--cream)', fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', lineHeight: 1.02, margin: '0 0 14px', position: 'relative' }}>
          Beach <span style={{ color: 'var(--orange)' }}>Football</span> League
        </h1>
        <p style={{ color: 'var(--sand)', fontFamily: 'Inter, sans-serif', fontSize: '1.05rem', maxWidth: 500, margin: '0 auto 32px', opacity: 0.85, position: 'relative' }}>
          Flag football on the sand. Sign up, get drafted, and compete all season long.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <Btn variant="primary" onClick={() => setView('signup')}>Sign Up to Play</Btn>
          <Btn variant="ghost" onClick={() => setView('public')}>View the League</Btn>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '60px 24px' }}>
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', display: 'grid' }}>
          {[
            { icon: '🏖️', title: 'Beach Play', body: 'Games on the sand every weekend. All skill levels welcome.' },
            { icon: '📋', title: 'Draft System', body: 'Organizers build balanced teams. Everyone gets placed.' },
            { icon: '📅', title: 'Full Schedule', body: 'Track games, RSVPs, scores, and standings all season.' },
          ].map(f => (
            <div key={f.title} style={{ background: '#fff', borderRadius: 18, padding: '28px 24px', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'Anton, sans-serif', fontSize: '1.1rem', margin: '0 0 8px', color: 'var(--navy)' }}>{f.title}</h3>
              <p style={{ color: 'var(--ink)', opacity: 0.7, fontSize: '0.9rem', margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Reusable Btn
function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, type = 'button', style: extraStyle }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'teal'; size?: 'sm' | 'md';
  disabled?: boolean; type?: 'button' | 'submit'; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    border: 'none', borderRadius: 999, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.5px', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform 0.13s, box-shadow 0.13s', opacity: disabled ? 0.55 : 1,
    fontFamily: 'inherit',
    padding: size === 'sm' ? '8px 16px' : '13px 26px',
    fontSize: size === 'sm' ? '0.75rem' : '0.9rem',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--orange)', color: 'var(--navy)', boxShadow: '0 6px 18px rgba(232,130,58,0.35)' },
    ghost: { background: 'transparent', color: 'var(--cream)', border: '2px solid rgba(250,246,238,0.4)' },
    outline: { background: 'transparent', color: 'var(--navy)', border: '2px solid var(--navy)' },
    danger: { background: 'transparent', color: '#b23b3b', border: '1.5px solid #b23b3b', fontWeight: 700 },
    teal: { background: 'var(--teal)', color: '#fff', boxShadow: '0 4px 12px rgba(44,122,140,0.3)' },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...extraStyle }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}>
      {children}
    </button>
  );
}

// Field
function Field({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy)', marginBottom: 7, opacity: 0.7 }}>{label}</label>
      {children}
      {helper && <p style={{ fontSize: '0.78rem', color: 'var(--navy)', opacity: 0.5, margin: '5px 0 0' }}>{helper}</p>}
    </div>
  );
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--line)',
  fontSize: '0.95rem', fontFamily: 'inherit', background: 'var(--cream)', color: 'var(--ink)',
  outline: 'none',
};

// Card wrapper
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: 32, ...style }}>{children}</div>;
}

// Eyebrow
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--teal)', fontSize: '0.72rem', fontWeight: 700, marginBottom: 8 }}>{children}</div>;
}

// Section wrapper
function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ maxWidth: 1040, margin: '0 auto', padding: '48px 24px', ...style }}>{children}</div>;
}

// Tabs
function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', borderBottom: '2px solid var(--line)', marginBottom: 28, gap: 2, overflowX: 'auto' }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '11px 18px', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase',
          letterSpacing: '0.5px', background: 'transparent', border: 'none', color: 'var(--navy)',
          opacity: active === t.key ? 1 : 0.45, borderBottom: `3px solid ${active === t.key ? 'var(--orange)' : 'transparent'}`,
          marginBottom: -2, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{t.label}</button>
      ))}
    </div>
  );
}

// Stat chip
function StatChip({ num, label }: { num: number; label: string }) {
  return (
    <div style={{ background: 'var(--navy)', color: 'var(--cream)', padding: '14px 20px', borderRadius: 14, minWidth: 110 }}>
      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: '1.6rem', color: 'var(--orange)' }}>{num}</div>
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.75 }}>{label}</div>
    </div>
  );
}

// Player chip
function PlayerChip({ player, day, isMe, extra }: { player: string; day?: string; isMe?: boolean; extra?: React.ReactNode }) {
  return (
    <span style={{
      background: '#fff', border: `1.5px solid ${isMe ? 'var(--teal)' : 'var(--line)'}`,
      padding: '8px 13px', borderRadius: 999, fontSize: '0.83rem', fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 7,
      outline: isMe ? '2px solid var(--teal)' : 'none', outlineOffset: 1,
    }}>
      {player}
      {day && <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.65rem', color: 'var(--teal)', fontWeight: 700, background: 'var(--sand)', padding: '2px 7px', borderRadius: 999 }}>{day}</span>}
      {extra}
    </span>
  );
}

// Draft board (read-only)
function DraftBoard({ draft, players, meId }: { draft: Draft; players: Player[]; meId?: string }) {
  const findPlayer = (id: string) => players.find(p => p.id === id);
  return (
    <div>
      <div style={{ background: 'var(--sand)', borderRadius: 16, padding: 20, marginBottom: 28, border: '1.5px dashed var(--teal)' }}>
        <div style={{ fontWeight: 800, fontSize: '0.83rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, color: 'var(--navy)' }}>
          Undrafted Pool ({draft.pool.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 36 }}>
          {draft.pool.length === 0
            ? <span style={{ fontSize: '0.85rem', opacity: 0.55 }}>Everyone has been drafted.</span>
            : draft.pool.map(id => {
                const p = findPlayer(id);
                if (!p) return null;
                return <PlayerChip key={id} player={p.name} day={p.day} isMe={id === meId} />;
              })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {draft.teams.map((t, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 12px rgba(13,33,54,0.07)' }}>
            <div style={{ background: t.color, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Anton, sans-serif', color: '#fff', fontSize: '1rem', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{t.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem', fontFamily: 'Space Mono, monospace' }}>{t.playerIds.length}p</span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '10px 0' }}>
              {t.playerIds.length === 0
                ? <li style={{ padding: '8px 16px', fontSize: '0.8rem', opacity: 0.45 }}>No players yet</li>
                : t.playerIds.map(id => {
                    const p = findPlayer(id);
                    if (!p) return null;
                    return (
                      <li key={id} style={{ padding: '7px 16px', fontSize: '0.85rem', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.name}
                        {id === meId && <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.65rem', color: 'var(--teal)' }}>· you</span>}
                      </li>
                    );
                  })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Schedule list
function ScheduleList({ games, teams, session, editable, onRemove, onSaveScore, onRsvp }: {
  games: Game[]; teams: Team[]; session: Session | null; editable: boolean;
  onRemove?: (id: string) => void; onSaveScore?: (id: string, a: number, b: number) => void;
  onRsvp?: (gameId: string, status: 'yes' | 'no') => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({});

  const sorted = [...games].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const myTeamIdx = (session?.type === 'player') ? teams.findIndex(t => t.playerIds.includes(session.id)) : -1;

  if (games.length === 0) return <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5, fontSize: '0.9rem' }}>No games scheduled yet.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sorted.map(g => {
        const db = fmtDateBlock(g.date, g.time);
        const onMyTeam = myTeamIdx > -1 && (g.teamA === myTeamIdx || g.teamB === myTeamIdx);
        const myStatus = onMyTeam && session ? (g.rsvps?.[session.id] || '') : '';
        const isExpanded = expanded === g.id;
        const teamA = typeof g.teamA === 'number' ? teams[g.teamA] : undefined;
        const teamB = typeof g.teamB === 'number' ? teams[g.teamB] : undefined;
        const scoreLocal = scores[g.id] || { a: hasFinalScore(g) ? String(g.scoreA) : '', b: hasFinalScore(g) ? String(g.scoreB) : '' };
        const yesCount = g.rsvps ? Object.values(g.rsvps).filter(v => v === 'yes').length : 0;

        return (
          <div key={g.id} onClick={() => onMyTeam && setExpanded(isExpanded ? null : g.id)}
            style={{ background: '#fff', border: `1.5px solid ${onMyTeam ? 'var(--teal)' : 'var(--line)'}`, borderRadius: 14,
              padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'flex-start', cursor: onMyTeam ? 'pointer' : 'default',
              boxShadow: onMyTeam ? '0 4px 14px rgba(44,122,140,0.12)' : 'var(--shadow)',
              transition: 'box-shadow 0.15s',
            }}>
            {/* Date block */}
            <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 46 }}>
              {db.weekday && <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.62rem', color: 'var(--teal)', letterSpacing: 1 }}>{db.weekday}</div>}
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: '1.9rem', lineHeight: 1, color: 'var(--navy)' }}>{db.day}</div>
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.62rem', color: 'var(--navy)', opacity: 0.6 }}>{db.month}</div>
              {db.time && <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.6rem', color: 'var(--orange)', marginTop: 2 }}>{db.time}</div>}
            </div>

            {/* Main content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {g.type === 'event' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ background: 'var(--teal)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.5 }}>Event</span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{g.title}</span>
                  </div>
                  {g.location && <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{g.location}</div>}
                  {g.notes && <div style={{ fontSize: '0.8rem', opacity: 0.55, marginTop: 4 }}>{g.notes}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>
                    <span style={{ color: teamA?.color || 'var(--navy)' }}>{teamA?.name || 'TBD'}</span>
                    <span style={{ opacity: 0.35, margin: '0 8px' }}>vs</span>
                    <span style={{ color: teamB?.color || 'var(--navy)' }}>{teamB?.name || 'TBD'}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {g.location && <span>{g.location}</span>}
                    {!editable && yesCount > 0 && <span>{yesCount} going</span>}
                  </div>
                  {g.notes && <div style={{ fontSize: '0.78rem', opacity: 0.5, marginTop: 4 }}>{g.notes}</div>}
                  {hasFinalScore(g) && (
                    <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.78rem', marginTop: 6, color: 'var(--navy)', fontWeight: 700 }}>
                      Final: {g.scoreA} – {g.scoreB}
                    </div>
                  )}
                  {onMyTeam && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background: myStatus === 'yes' ? '#d1fae5' : myStatus === 'no' ? '#fee2e2' : 'var(--sand)',
                        color: myStatus === 'yes' ? '#065f46' : myStatus === 'no' ? '#991b1b' : 'var(--navy)',
                      }}>
                        {myStatus === 'yes' ? "You're in ✓" : myStatus === 'no' ? "Can't make it" : 'RSVP'}
                      </span>
                      {isExpanded && (
                        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => onRsvp?.(g.id, 'yes')} style={{
                            padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                            background: myStatus === 'yes' ? 'var(--teal)' : 'var(--sand)', color: myStatus === 'yes' ? '#fff' : 'var(--navy)',
                            fontWeight: 700, fontSize: '0.78rem',
                          }}>I'm in</button>
                          <button onClick={() => onRsvp?.(g.id, 'no')} style={{
                            padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                            background: myStatus === 'no' ? '#b23b3b' : 'var(--sand)', color: myStatus === 'no' ? '#fff' : 'var(--navy)',
                            fontWeight: 700, fontSize: '0.78rem',
                          }}>Can't make it</button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Organizer: score entry + rsvp list */}
                  {editable && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Score:</span>
                        <input type="number" min="0" value={scoreLocal.a} placeholder="0"
                          onChange={e => setScores(prev => ({ ...prev, [g.id]: { ...scoreLocal, a: e.target.value } }))}
                          style={{ width: 60, ...inputStyle, padding: '5px 8px', fontSize: '0.85rem' }} />
                        <span style={{ opacity: 0.4 }}>–</span>
                        <input type="number" min="0" value={scoreLocal.b} placeholder="0"
                          onChange={e => setScores(prev => ({ ...prev, [g.id]: { ...scoreLocal, b: e.target.value } }))}
                          style={{ width: 60, ...inputStyle, padding: '5px 8px', fontSize: '0.85rem' }} />
                        <Btn size="sm" variant="outline" onClick={() => {
                          const sc = scores[g.id] || scoreLocal;
                          const a = Number(sc.a), b = Number(sc.b);
                          if (sc.a === '' || sc.b === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) { alert('Enter a whole-number score for both teams.'); return; }
                          onSaveScore?.(g.id, a, b);
                        }}>Save</Btn>
                      </div>
                      {/* RSVP summary */}
                      {(teamA || teamB) && (() => {
                        const playerIds = [...(teamA?.playerIds || []), ...(teamB?.playerIds || [])];
                        const yes = playerIds.filter(id => g.rsvps?.[id] === 'yes').length;
                        const no = playerIds.filter(id => g.rsvps?.[id] === 'no').length;
                        const pending = playerIds.length - yes - no;
                        return playerIds.length > 0 ? (
                          <div style={{ display: 'flex', gap: 8, fontSize: '0.75rem', flexWrap: 'wrap' }}>
                            <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>{yes} Yes</span>
                            <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>{no} No</span>
                            <span style={{ background: 'var(--sand)', color: 'var(--navy)', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>{pending} Pending</span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Remove button for organizer */}
            {editable && (
              <button onClick={e => { e.stopPropagation(); if (confirm('Remove this entry?')) onRemove?.(g.id); }}
                style={{ flexShrink: 0, background: 'transparent', color: '#b23b3b', border: '1.5px solid #b23b3b', borderRadius: 8, padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Standings
function PlayoffBracket({ seeds }: { seeds: { team: { name: string; color: string }; seed: number }[] }) {
  const n = seeds.length;
  if (n < 2) return null;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
  const totalRounds = Math.log2(bracketSize);

  // Build rounds
  const rounds: { label: string; matches: { top: string; topColor?: string; bot: string; botColor?: string }[] }[] = [];

  // Round 1: seed matchups (1 vs last, 2 vs second-to-last, etc.)
  const r1matches: { top: string; topColor?: string; bot: string; botColor?: string }[] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const hi = seeds[i];
    const lo = seeds[bracketSize - 1 - i];
    r1matches.push({
      top: hi ? hi.team.name : 'BYE',
      topColor: hi?.team.color,
      bot: lo ? lo.team.name : 'BYE',
      botColor: lo?.team.color,
    });
  }
  const roundLabel = (r: number) => {
    if (r === totalRounds - 1) return 'Championship';
    if (r === totalRounds - 2) return 'Semifinals';
    if (r === totalRounds - 3) return 'Quarterfinals';
    return `Round ${r + 1}`;
  };
  rounds.push({ label: roundLabel(0), matches: r1matches });

  // Subsequent rounds
  for (let r = 1; r < totalRounds; r++) {
    const prevCount = bracketSize / Math.pow(2, r);
    const matches: { top: string; bot: string }[] = [];
    for (let i = 0; i < prevCount / 2; i++) {
      matches.push({ top: `W · Game ${i * 2 + 1}`, bot: `W · Game ${i * 2 + 2}` });
    }
    rounds.push({ label: roundLabel(r), matches });
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: '1.1rem', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>Playoff Bracket</div>
      <p style={{ fontSize: '0.78rem', opacity: 0.55, margin: '0 0 18px', fontFamily: 'Space Mono, monospace' }}>
        All {n} teams qualify · higher seeds receive byes as needed
      </p>
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', minWidth: 'max-content' }}>
          {rounds.map((round, ri) => (
            <div key={ri} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              {/* Round header */}
              <div style={{ background: ri === rounds.length - 1 ? 'var(--orange)' : 'var(--navy)', color: ri === rounds.length - 1 ? 'var(--navy)' : 'var(--cream)', padding: '8px 18px', fontFamily: 'Space Mono, monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', borderRight: ri < rounds.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                {round.label}
              </div>
              {/* Matches */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '12px 0', gap: 0 }}>
                {round.matches.map((m, mi) => {
                  const isBye = (name: string) => name === 'BYE';
                  const isWinner = (name: string) => name.startsWith('W ·');
                  return (
                    <div key={mi} style={{ margin: '8px 0', position: 'relative' }}>
                      {/* Connector line on the right (all but last round) */}
                      {ri < rounds.length - 1 && (
                        <div style={{ position: 'absolute', right: -1, top: '25%', bottom: '25%', width: 1, background: 'var(--line)' }} />
                      )}
                      {/* Connector line on the left (all but first round) */}
                      {ri > 0 && (
                        <div style={{ position: 'absolute', left: 0, top: '50%', width: 12, height: 1, background: 'var(--line)' }} />
                      )}
                      <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', width: 180, marginLeft: ri > 0 ? 12 : 0, background: '#fff', boxShadow: '0 2px 8px rgba(13,33,54,0.07)' }}>
                        {/* Top team */}
                        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 7, background: isBye(m.top) ? 'var(--sand)' : '#fff' }}>
                          {!isBye(m.top) && !isWinner(m.top) && (m as { topColor?: string }).topColor && (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: (m as { topColor?: string }).topColor, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: '0.8rem', fontWeight: isWinner(m.top) ? 400 : 700, opacity: isBye(m.top) || isWinner(m.top) ? 0.4 : 1, color: 'var(--navy)', fontFamily: isWinner(m.top) ? 'Space Mono, monospace' : 'inherit', fontStyle: isBye(m.top) ? 'italic' : 'normal' }}>
                            {m.top}
                          </span>
                        </div>
                        {/* Bottom team */}
                        <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 7, background: isBye(m.bot) ? 'var(--sand)' : '#fff' }}>
                          {!isBye(m.bot) && !isWinner(m.bot) && (m as { botColor?: string }).botColor && (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: (m as { botColor?: string }).botColor, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: '0.8rem', fontWeight: isWinner(m.bot) ? 400 : 700, opacity: isBye(m.bot) || isWinner(m.bot) ? 0.4 : 1, color: 'var(--navy)', fontFamily: isWinner(m.bot) ? 'Space Mono, monospace' : 'inherit', fontStyle: isBye(m.bot) ? 'italic' : 'normal' }}>
                            {m.bot}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Standings({ teams, games }: { teams: Team[]; games: Game[] }) {
  const rows = computeStandings(teams, games);
  if (!rows.length) return <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5, fontSize: '0.9rem' }}>No teams yet.</div>;
  const seeds = rows.map((row, i) => ({ team: row.team, seed: i + 1 }));
  return (
    <div>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <table className="standings-table">
          <thead><tr>
            {['Team','GP','W','L','T','PF','PA','Pts'].map(h => <th key={h}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.7rem', color: 'var(--teal)', minWidth: 20 }}>#{i + 1}</span>
                  <span style={{ fontWeight: 700, color: row.team.color }}>{row.team.name}</span>
                </td>
                <td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.ties}</td>
                <td>{row.for}</td><td>{row.against}</td>
                <td><strong>{row.points}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PlayoffBracket seeds={seeds} />
    </div>
  );
}

// Public / Home (league info) view
function PublicView({ draft, players, games }: { draft: Draft; players: Player[]; games: Game[] }) {
  const [tab, setTab] = useState('schedule');
  const tabs = [{ key: 'schedule', label: 'Schedule' }, { key: 'standings', label: 'Standings' }, { key: 'teams', label: 'Teams' }];
  return (
    <Section>
      <Eyebrow>Beach Football League</Eyebrow>
      <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', margin: '0 0 32px' }}>League Home</h2>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'schedule' && <ScheduleList games={games} teams={draft.teams} session={null} editable={false} />}
      {tab === 'standings' && <Standings teams={draft.teams} games={games} />}
      {tab === 'teams' && <DraftBoard draft={draft} players={players} />}
    </Section>
  );
}

// Sign Up view
function SignupView({ onSuccess }: { onSuccess: (player: Player) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [position, setPosition] = useState('');
  const [pass, setPass] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState('');
  const days = ['Saturday', 'Sunday', 'Either', 'Other'];

  const submit = () => {
    setError('');
    if (!name || !email || !pass) { setError('Fill in your name, email, and a password.'); return; }
    if (!day) { setError('Pick your best day to play.'); return; }
    if (pass.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
    const player: Player = { id: uid(), name, email: email.toLowerCase(), phone, day, age, position, pass, createdAt: Date.now() };
    onSuccess(player);
  };

  return (
    <Section style={{ maxWidth: 600 }}>
      <Eyebrow>Player Registration</Eyebrow>
      <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: '2rem', margin: '0 0 28px' }}>Sign Up to Play</h2>
      <Card>
        <Field label="Full Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
        <Field label="Phone (optional)"><input style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(optional)" /></Field>
        <Field label="Age / Grade">
          <select style={inputStyle} value={age} onChange={e => setAge(e.target.value)}>
            <option value="">Select…</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="Adult">Adult</option>
          </select>
        </Field>
        <Field label="Best Position">
          <select style={inputStyle} value={position} onChange={e => setPosition(e.target.value)}>
            <option value="">No preference</option>
            <option>Quarterback</option><option>Receiver</option><option>Rusher</option><option>Flex / Either</option>
          </select>
        </Field>
        <Field label="Best Day to Play">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {days.map(d => (
              <button key={d} type="button" onClick={() => setDay(d)} style={{
                padding: '9px 16px', borderRadius: 999, border: `1.5px solid ${day === d ? 'var(--navy)' : 'var(--line)'}`,
                background: day === d ? 'var(--navy)' : 'var(--cream)', color: day === d ? 'var(--cream)' : 'var(--ink)',
                fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
              }}>{d}</button>
            ))}
          </div>
        </Field>
        <Field label="Password" helper="At least 6 characters"><input style={inputStyle} type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
        {error && <p style={{ color: '#b23b3b', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 14px' }}>{error}</p>}
        <Btn onClick={submit}>Create Account</Btn>
      </Card>
    </Section>
  );
}

// Login view
function LoginView({ players, organizers, onPlayerLogin, onOrgLogin, onOrgSignup }: {
  players: Player[]; organizers: Organizer[];
  onPlayerLogin: (session: Session) => void; onOrgLogin: (session: Session) => void;
  onOrgSignup: (org: Organizer) => void;
}) {
  const [loginTab, setLoginTab] = useState<'player' | 'organizer'>('player');
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('');
  const [oEmail, setOEmail] = useState(''); const [oPass, setOPass] = useState('');
  const [error, setError] = useState('');
  const [showOrgSignup, setShowOrgSignup] = useState(false);
  const [osName, setOsName] = useState(''); const [osEmail, setOsEmail] = useState('');
  const [osPass, setOsPass] = useState(''); const [osCode, setOsCode] = useState('');
  const [osError, setOsError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState(''); const [resetPass, setResetPass] = useState('');
  const [resetConfirm, setResetConfirm] = useState(''); const [resetMsg, setResetMsg] = useState('');

  const submitPlayer = () => {
    setError('');
    if (!email || !pass) { setError('Enter your email and password.'); return; }
    const p = players.find(p => p.email === email.toLowerCase() && p.pass === pass);
    if (!p) { setError('No match. Check your email and password.'); return; }
    onPlayerLogin({ type: 'player', id: p.id, name: p.name, email: p.email });
  };
  const submitOrg = () => {
    setError('');
    if (!oEmail || !oPass) { setError('Enter your email and password.'); return; }
    const o = organizers.find(o => o.email === oEmail.toLowerCase() && o.pass === oPass);
    if (!o) { setError('No match. Check your email and password.'); return; }
    onOrgLogin({ type: 'organizer', id: o.id, name: o.name, email: o.email });
  };
  const submitOrgSignup = () => {
    setOsError('');
    if (!osName || !osEmail || !osPass || !osCode) { setOsError('Fill in every field, including the access code.'); return; }
    if (osCode !== 'BEACH2026') { setOsError('That access code is not correct.'); return; }
    if (organizers.some(o => o.email === osEmail.toLowerCase())) { setOsError('That email already has an organizer account.'); return; }
    const org: Organizer = { id: uid(), name: osName, email: osEmail.toLowerCase(), pass: osPass, createdAt: Date.now() };
    onOrgSignup(org);
    onOrgLogin({ type: 'organizer', id: org.id, name: org.name, email: org.email });
  };
  const submitReset = () => {
    setResetMsg('');
    if (!resetEmail || !resetPass || !resetConfirm) { setResetMsg('Fill in every field.'); return; }
    if (resetPass.length < 6) { setResetMsg('Password needs to be at least 6 characters.'); return; }
    if (resetPass !== resetConfirm) { setResetMsg('The passwords do not match.'); return; }
    const account = loginTab === 'organizer'
      ? organizers.find(o => o.email === resetEmail.toLowerCase())
      : players.find(p => p.email === resetEmail.toLowerCase());
    if (!account) { setResetMsg('We could not find that account for this email.'); return; }
    account.pass = resetPass;
    dbSet(loginTab === 'organizer' ? 'organizers' : 'players', loginTab === 'organizer' ? organizers : players);
    setResetMsg('✓ Password updated. You can log in now.');
  };

  return (
    <Section style={{ maxWidth: 520 }}>
      <Eyebrow>Welcome back</Eyebrow>
      <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: '2rem', margin: '0 0 28px' }}>Log In</h2>
      <Card>
        <Tabs tabs={[{ key: 'player', label: 'Player' }, { key: 'organizer', label: 'Organizer' }]} active={loginTab} onChange={k => { setLoginTab(k as 'player' | 'organizer'); setError(''); }} />
        {loginTab === 'player' ? (
          <>
            <Field label="Email"><input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitPlayer()} /></Field>
            <Field label="Password"><input style={inputStyle} type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitPlayer()} /></Field>
            {error && <p style={{ color: '#b23b3b', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 14px' }}>{error}</p>}
            <Btn onClick={submitPlayer}>Log In as Player</Btn>
          </>
        ) : (
          <>
            <Field label="Email"><input style={inputStyle} type="email" value={oEmail} onChange={e => setOEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitOrg()} /></Field>
            <Field label="Password"><input style={inputStyle} type="password" value={oPass} onChange={e => setOPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitOrg()} /></Field>
            {error && <p style={{ color: '#b23b3b', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 14px' }}>{error}</p>}
            <Btn onClick={submitOrg}>Log In as Organizer</Btn>
            <div style={{ marginTop: 16 }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                onClick={() => setShowOrgSignup(s => !s)}>
                {showOrgSignup ? 'Hide organizer signup' : 'Create organizer account'}
              </button>
            </div>
            {showOrgSignup && (
              <div style={{ marginTop: 20, padding: '20px', background: 'var(--sand)', borderRadius: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>New Organizer</div>
                <Field label="Name"><input style={inputStyle} value={osName} onChange={e => setOsName(e.target.value)} /></Field>
                <Field label="Email"><input style={inputStyle} type="email" value={osEmail} onChange={e => setOsEmail(e.target.value)} /></Field>
                <Field label="Password"><input style={inputStyle} type="password" value={osPass} onChange={e => setOsPass(e.target.value)} /></Field>
                <Field label="Access Code" helper="Ask a league organizer for the code"><input style={inputStyle} value={osCode} onChange={e => setOsCode(e.target.value)} /></Field>
                {osError && <p style={{ color: '#b23b3b', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 14px' }}>{osError}</p>}
                <Btn onClick={submitOrgSignup} size="sm">Create Organizer Account</Btn>
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            onClick={() => setShowReset(s => !s)}>
            {showReset ? 'Hide' : 'Forgot password?'}
          </button>
        </div>
        {showReset && (
          <div style={{ marginTop: 16, padding: '16px', background: 'var(--sand)', borderRadius: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reset Password</div>
            <Field label="Your Email"><input style={inputStyle} type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} /></Field>
            <Field label="New Password"><input style={inputStyle} type="password" value={resetPass} onChange={e => setResetPass(e.target.value)} /></Field>
            <Field label="Confirm Password"><input style={inputStyle} type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} /></Field>
            {resetMsg && <p style={{ color: resetMsg.startsWith('✓') ? '#065f46' : '#b23b3b', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 12px' }}>{resetMsg}</p>}
            <Btn onClick={submitReset} size="sm">Reset Password</Btn>
          </div>
        )}
      </Card>
    </Section>
  );
}

// Player Dashboard
function PlayerDashboard({ session, draft, players, games, onRsvp }: {
  session: Session; draft: Draft; players: Player[]; games: Game[];
  onRsvp: (gameId: string, status: 'yes' | 'no') => void;
}) {
  const [tab, setTab] = useState('board');
  const me = players.find(p => p.id === session.id);
  const myTeam = draft.teams.find(t => t.playerIds.includes(session.id));
  const tabs = [{ key: 'board', label: 'Draft Board' }, { key: 'schedule', label: 'Schedule' }, { key: 'standings', label: 'Standings' }];
  return (
    <Section>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <Eyebrow>Player Dashboard</Eyebrow>
          <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: '2rem', margin: 0 }}>{session.name}</h2>
          {me && <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.72rem', color: 'var(--teal)', marginTop: 4 }}>Best day: {me.day}</div>}
        </div>
        <div style={{
          background: myTeam ? myTeam.color : 'var(--sand)',
          color: myTeam ? '#fff' : 'var(--navy)',
          borderRadius: 14, padding: '14px 20px',
          boxShadow: myTeam ? '0 4px 14px rgba(0,0,0,0.15)' : 'none',
        }}>
          {myTeam ? (
            <>
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.65rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 }}>Your team</div>
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: '1.4rem', textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>{myTeam.name}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Status</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>In the undrafted pool</div>
            </>
          )}
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'board' && <DraftBoard draft={draft} players={players} meId={session.id} />}
      {tab === 'schedule' && <ScheduleList games={games} teams={draft.teams} session={session} editable={false} onRsvp={onRsvp} />}
      {tab === 'standings' && <Standings teams={draft.teams} games={games} />}
    </Section>
  );
}

// Organizer Board
function OrganizerBoard({ session, draft, players, games, organizers, onDraftChange, onPlayersChange, onGamesChange, onOrgSignup }: {
  session: Session; draft: Draft; players: Player[]; games: Game[]; organizers: Organizer[];
  onDraftChange: (d: Draft) => void; onPlayersChange: (p: Player[]) => void;
  onGamesChange: (g: Game[]) => void; onOrgSignup?: (o: Organizer) => void;
}) {
  const [tab, setTab] = useState('board');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [poolSearch, setPoolSearch] = useState('');
  const [poolSort, setPoolSort] = useState('rank-asc');
  const [sortKey, setSortKey] = useState<string>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [schedType, setSchedType] = useState<'game' | 'event'>('game');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedLoc, setSchedLoc] = useState('');
  const [schedNotes, setSchedNotes] = useState('');
  const [schedTeamA, setSchedTeamA] = useState(0);
  const [schedTeamB, setSchedTeamB] = useState(1);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedError, setSchedError] = useState('');
  const [chatMsg, setChatMsg] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>([]);

  const findPlayer = (id: string) => players.find(p => p.id === id);
  const totalDrafted = draft.teams.reduce((s, t) => s + t.playerIds.length, 0);

  const filteredPool = () => {
    const term = poolSearch.trim().toLowerCase();
    let ids = draft.pool.filter(id => {
      const p = findPlayer(id);
      if (!p) return false;
      if (!term) return true;
      return [p.name, p.day, p.position, p.age].some(v => (v || '').toLowerCase().includes(term));
    });
    const [key, dir] = poolSort.split('-');
    if (key === 'rank') return ids;
    ids.sort((a, b) => {
      const pa = findPlayer(a), pb = findPlayer(b);
      const va = (pa && (pa as unknown as Record<string, string>)[key]) || '';
      const vb = (pb && (pb as unknown as Record<string, string>)[key]) || '';
      const cmp = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
      return dir === 'desc' ? -cmp : cmp;
    });
    return ids;
  };

  const movePlayer = (playerId: string, dest: number | 'pool') => {
    const newDraft = JSON.parse(JSON.stringify(draft)) as Draft;
    const fromTeam = newDraft.teams.findIndex(t => t.playerIds.includes(playerId));
    if (fromTeam > -1) newDraft.teams[fromTeam].playerIds = newDraft.teams[fromTeam].playerIds.filter(id => id !== playerId);
    else newDraft.pool = newDraft.pool.filter(id => id !== playerId);
    if (dest === 'pool') { if (!newDraft.pool.includes(playerId)) newDraft.pool.push(playerId); }
    else newDraft.teams[dest].playerIds.push(playerId);
    setSelectedPoolId(null);
    onDraftChange(newDraft);
  };

  const deletePlayer = (playerId: string) => {
    const p = findPlayer(playerId);
    if (!p) return;
    if (!confirm(`Remove ${p.name} from the league? This cannot be undone.`)) return;
    const newPlayers = players.filter(pl => pl.id !== playerId);
    const newDraft = JSON.parse(JSON.stringify(draft)) as Draft;
    newDraft.pool = newDraft.pool.filter(id => id !== playerId);
    newDraft.teams.forEach(t => { t.playerIds = t.playerIds.filter(id => id !== playerId); });
    const newGames = games.map(g => {
      if (!g.rsvps) return g;
      const rsvps = { ...g.rsvps };
      delete rsvps[playerId];
      return { ...g, rsvps };
    });
    onPlayersChange(newPlayers);
    onDraftChange(newDraft);
    onGamesChange(newGames);
  };

  const addMockPlayers = () => {
    const newPlayers = [...players];
    const newDraft = JSON.parse(JSON.stringify(draft)) as Draft;
    for (let i = 0; i < 10; i++) {
      const first = MOCK_FIRST[Math.floor(Math.random() * MOCK_FIRST.length)];
      const last = MOCK_LAST[Math.floor(Math.random() * MOCK_LAST.length)];
      const p: Player = {
        id: uid(), name: `${first} ${last}`, email: `mock.${uid()}@example.com`,
        phone: '', day: MOCK_DAYS[Math.floor(Math.random() * MOCK_DAYS.length)],
        age: GRADES[Math.floor(Math.random() * GRADES.length)],
        position: MOCK_POSITIONS[Math.floor(Math.random() * MOCK_POSITIONS.length)],
        pass: 'mock', createdAt: Date.now(), isMock: true,
      };
      newPlayers.push(p);
      newDraft.pool.push(p.id);
    }
    onPlayersChange(newPlayers);
    onDraftChange(newDraft);
  };

  const addGame = () => {
    setSchedError('');
    if (!schedDate) { setSchedError('Pick a date.'); return; }
    if (schedType === 'event') {
      if (!schedTitle) { setSchedError('Give the event a title.'); return; }
      const entry: Game = { id: uid(), type: 'event', date: schedDate, time: schedTime, location: schedLoc, notes: schedNotes, title: schedTitle };
      onGamesChange([...games, entry]);
    } else {
      if (draft.teams.length < 2) { setSchedError('Add at least two teams first.'); return; }
      if (schedTeamA === schedTeamB) { setSchedError('Team A and Team B must be different.'); return; }
      const entry: Game = { id: uid(), type: 'game', date: schedDate, time: schedTime, location: schedLoc, notes: schedNotes, teamA: schedTeamA, teamB: schedTeamB, rsvps: {} };
      onGamesChange([...games, entry]);
    }
    setSchedDate(''); setSchedTime(''); setSchedLoc(''); setSchedNotes(''); setSchedTitle('');
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const getVal = (p: Player) => {
      if (sortKey === 'rank') return players.indexOf(p);
      if (sortKey === 'status') {
        const t = draft.teams.find(t => t.playerIds.includes(p.id));
        return t ? t.name : 'zzz';
      }
      return (p as unknown as Record<string, string>)[sortKey] || '';
    };
    const av = String(getVal(a)).toLowerCase(), bv = String(getVal(b)).toLowerCase();
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const orgTabs = [
    { key: 'board', label: 'Draft Board' },
    { key: 'players', label: `Players (${players.length})` },
    { key: 'schedule', label: 'Schedule' },
    { key: 'standings', label: 'Standings' },
    { key: 'chat', label: 'Chat' },
  ];

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    const newChat: ChatMsg[] = [...chat, { id: uid(), name: session.name, message: chatMsg.trim(), ts: Date.now() }];
    setChat(newChat);
    dbSet('chat', newChat);
    setChatMsg('');
  };

  const fmtChatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <Section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>Organizer</Eyebrow>
          <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: '2rem', margin: 0 }}>{
            { board: 'Draft Board', players: 'Players', schedule: 'Schedule', standings: 'Standings', chat: 'League Chat' }[tab]
          }</h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <StatChip num={players.length} label="Signed up" />
          <StatChip num={draft.pool.length} label="In pool" />
          <StatChip num={totalDrafted} label="Drafted" />
        </div>
      </div>
      <Tabs tabs={orgTabs} active={tab} onChange={setTab} />

      {/* ── DRAFT BOARD ── */}
      {tab === 'board' && (
        <div>
          {/* Pool */}
          <div style={{ background: 'var(--sand)', borderRadius: 16, padding: 20, marginBottom: 28, border: '1.5px dashed var(--teal)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: '0.83rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy)' }}>
                Undrafted Pool ({draft.pool.length})
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="Search players…" value={poolSearch} onChange={e => setPoolSearch(e.target.value)}
                  style={{ ...inputStyle, width: 180, padding: '8px 12px', fontSize: '0.85rem' }} />
                <select value={poolSort} onChange={e => setPoolSort(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '8px 12px', fontSize: '0.85rem' }}>
                  <option value="rank-asc">Default order</option>
                  <option value="name-asc">Name A–Z</option>
                  <option value="day-asc">Day</option>
                  <option value="position-asc">Position</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: '0.78rem', opacity: 0.55, marginBottom: 10 }}>
              {selectedPoolId ? `Selected: ${findPlayer(selectedPoolId)?.name} — tap "Add here" on a team` : 'Tap a player to select, then "Add here" on a team.'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {filteredPool().length === 0
                ? <span style={{ fontSize: '0.85rem', opacity: 0.55 }}>
                    {draft.pool.length === 0 ? 'Everyone has been drafted.' : 'No players match your search.'}
                  </span>
                : filteredPool().map(id => {
                    const p = findPlayer(id);
                    if (!p) return null;
                    const isSelected = selectedPoolId === id;
                    return (
                      <span key={id} onClick={() => setSelectedPoolId(isSelected ? null : id)}
                        style={{
                          background: isSelected ? 'var(--orange)' : '#fff',
                          border: `1.5px solid ${isSelected ? 'var(--orange)' : 'var(--line)'}`,
                          color: isSelected ? 'var(--navy)' : 'var(--ink)',
                          padding: '8px 13px', borderRadius: 999, fontSize: '0.83rem', fontWeight: 600,
                          display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                          transition: 'background 0.12s',
                        }}>
                        {p.name}
                        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.62rem', padding: '1px 6px', borderRadius: 999, background: isSelected ? 'rgba(255,255,255,0.3)' : 'var(--sand)', color: isSelected ? 'var(--navy)' : 'var(--teal)', fontWeight: 700 }}>{p.day}</span>
                        <select className="move-sel" onClick={e => e.stopPropagation()} onChange={async e => {
                          const val = e.target.value;
                          if (val === '') return;
                          movePlayer(id, parseInt(val, 10));
                          e.target.value = '';
                        }} style={{ border: '1px solid var(--line)', borderRadius: 999, background: isSelected ? 'rgba(255,255,255,0.9)' : '#fff', color: 'var(--navy)', fontSize: '0.7rem', padding: '2px 6px', cursor: 'pointer' }}>
                          <option value="">Move to…</option>
                          {draft.teams.map((t, ti) => <option key={ti} value={ti}>{t.name}</option>)}
                        </select>
                      </span>
                    );
                  })}
            </div>
          </div>

          {/* Teams */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
            {draft.teams.map((t, idx) => (
              <div key={idx} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 12px rgba(13,33,54,0.07)' }}>
                <div style={{ background: t.color, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <input value={t.name} onChange={e => {
                      const nd = JSON.parse(JSON.stringify(draft)) as Draft;
                      nd.teams[idx].name = e.target.value || t.name;
                      onDraftChange(nd);
                    }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', fontFamily: 'Anton, sans-serif', fontSize: '1rem', width: '100%', outline: 'none' }} />
                    <input type="color" value={t.color} onChange={e => {
                      const nd = JSON.parse(JSON.stringify(draft)) as Draft;
                      nd.teams[idx].color = e.target.value;
                      onDraftChange(nd);
                    }} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 4, flexShrink: 0 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'Space Mono, monospace', fontSize: '0.68rem' }}>{t.playerIds.length} players</span>
                    <button onClick={() => {
                      if (t.playerIds.length) { alert('Move every player out first.'); return; }
                      if (!confirm(`Remove ${t.name}?`)) return;
                      const nd = JSON.parse(JSON.stringify(draft)) as Draft;
                      nd.teams.splice(idx, 1);
                      const newGames = games.map(g => ({ ...g, teamA: g.teamA !== undefined && g.teamA > idx ? g.teamA - 1 : g.teamA, teamB: g.teamB !== undefined && g.teamB > idx ? g.teamB - 1 : g.teamB }));
                      onDraftChange(nd);
                      onGamesChange(newGames);
                    }} style={{ background: 'rgba(0,0,0,0.25)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
                  </div>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
                  {t.playerIds.length === 0
                    ? <li style={{ padding: '8px 14px', fontSize: '0.8rem', opacity: 0.4 }}>No players yet</li>
                    : t.playerIds.map(pid => {
                        const p = findPlayer(pid);
                        if (!p) return null;
                        return (
                          <li key={pid} style={{ padding: '7px 14px', fontSize: '0.83rem', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{p.name}</span>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              <select onChange={e => { const v = e.target.value; if (!v) return; movePlayer(pid, v === 'pool' ? 'pool' : parseInt(v, 10)); e.target.value = ''; }}
                                style={{ border: '1px solid var(--line)', borderRadius: 999, background: '#fff', color: 'var(--navy)', fontSize: '0.7rem', padding: '2px 6px', cursor: 'pointer' }}>
                                <option value="">Move to…</option>
                                <option value="pool">Pool</option>
                                {draft.teams.map((t2, ti) => ti !== idx && <option key={ti} value={ti}>{t2.name}</option>)}
                              </select>
                              <button onClick={() => movePlayer(pid, 'pool')} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }} title="Back to pool">×</button>
                            </div>
                          </li>
                        );
                      })}
                </ul>
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
                  <button disabled={!selectedPoolId} onClick={() => selectedPoolId && movePlayer(selectedPoolId, idx)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, background: selectedPoolId ? 'var(--navy)' : 'var(--line)', color: selectedPoolId ? '#fff' : 'var(--navy)', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: selectedPoolId ? 'pointer' : 'not-allowed', opacity: selectedPoolId ? 1 : 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Add here
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="teal" onClick={() => {
              const nd = JSON.parse(JSON.stringify(draft)) as Draft;
              nd.teams.push({ name: `Team ${nd.teams.length + 1}`, color: '#2c7a8c', playerIds: [] });
              onDraftChange(nd);
            }}>+ Add Team</Btn>
            <Btn size="sm" variant="outline" onClick={() => {
              if (!confirm('Move every drafted player back to the pool?')) return;
              const nd = JSON.parse(JSON.stringify(draft)) as Draft;
              nd.teams.forEach(t => t.playerIds = []);
              nd.pool = players.map(p => p.id);
              onDraftChange(nd);
            }}>Reset Draft</Btn>
            <Btn size="sm" variant="outline" onClick={addMockPlayers}>+ 10 Mock Players</Btn>
          </div>
        </div>
      )}

      {/* ── PLAYERS ── */}
      {tab === 'players' && (
        <div>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr>
                  {[{ k: 'rank', l: '#' }, { k: 'name', l: 'Name' }, { k: 'email', l: 'Email' }, { k: 'phone', l: 'Phone' }, { k: 'day', l: 'Day' }, { k: 'age', l: 'Age/Grade' }, { k: 'position', l: 'Position' }, { k: 'status', l: 'Status' }, { k: 'actions', l: '' }].map(h => (
                    <th key={h.k} onClick={() => {
                      if (h.k === 'actions') return;
                      if (sortKey === h.k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortKey(h.k); setSortDir('asc'); }
                    }} style={{ textAlign: 'left', padding: '10px 12px', background: 'var(--navy)', color: 'var(--sand)', fontFamily: 'Space Mono, monospace', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, cursor: h.k !== 'actions' ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {h.l}{sortKey === h.k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.length === 0
                  ? <tr><td colSpan={9} style={{ padding: '20px 12px', opacity: 0.5, textAlign: 'center' }}>No players signed up yet.</td></tr>
                  : sortedPlayers.map((p, i) => {
                      const team = draft.teams.find(t => t.playerIds.includes(p.id));
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(13,33,54,0.03)'}
                          onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                          <td style={{ padding: '10px 12px', fontFamily: 'Space Mono, monospace', fontSize: '0.7rem', color: 'var(--teal)' }}>{i + 1}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.name}</td>
                          <td style={{ padding: '10px 12px', opacity: 0.7 }}>{p.email}</td>
                          <td style={{ padding: '10px 12px', opacity: 0.7 }}>{p.phone || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>{p.day}</td>
                          <td style={{ padding: '10px 12px', opacity: 0.7 }}>{p.age || '—'}</td>
                          <td style={{ padding: '10px 12px', opacity: 0.7 }}>{p.position || 'No pref'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {team
                              ? <span style={{ background: team.color, color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>{team.name}</span>
                              : <span style={{ background: 'var(--sand)', color: 'var(--navy)', fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>In pool</span>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <button onClick={() => deletePlayer(p.id)} style={{
                              background: 'transparent', color: '#b23b3b', border: '1.5px solid #b23b3b',
                              borderRadius: 8, padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                              textTransform: 'uppercase', letterSpacing: '0.3px',
                              transition: 'background 0.12s, color 0.12s',
                            }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#b23b3b'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#b23b3b'; }}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SCHEDULE ── */}
      {tab === 'schedule' && (
        <div>
          <Card style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 800, fontSize: '0.83rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>Add Entry</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['game', 'event'] as const).map(t => (
                <button key={t} onClick={() => setSchedType(t)} style={{ padding: '8px 16px', borderRadius: 999, border: `1.5px solid ${schedType === t ? 'var(--navy)' : 'var(--line)'}`, background: schedType === t ? 'var(--navy)' : 'var(--cream)', color: schedType === t ? '#fff' : 'var(--navy)', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>
                  {t === 'game' ? 'Game' : 'Non-game Event'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
              <Field label="Date"><input type="date" style={inputStyle} value={schedDate} onChange={e => setSchedDate(e.target.value)} /></Field>
              <Field label="Time (opt)"><input type="time" style={inputStyle} value={schedTime} onChange={e => setSchedTime(e.target.value)} /></Field>
              <Field label="Location (opt)"><input style={inputStyle} value={schedLoc} onChange={e => setSchedLoc(e.target.value)} /></Field>
            </div>
            {schedType === 'event' && (
              <Field label="Event Title"><input style={inputStyle} value={schedTitle} onChange={e => setSchedTitle(e.target.value)} /></Field>
            )}
            {schedType === 'game' && draft.teams.length >= 2 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <Field label="Team A">
                  <select style={inputStyle} value={schedTeamA} onChange={e => setSchedTeamA(parseInt(e.target.value, 10))}>
                    {draft.teams.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Team B">
                  <select style={inputStyle} value={schedTeamB} onChange={e => setSchedTeamB(parseInt(e.target.value, 10))}>
                    {draft.teams.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Notes (opt)"><input style={inputStyle} value={schedNotes} onChange={e => setSchedNotes(e.target.value)} /></Field>
            {schedError && <p style={{ color: '#b23b3b', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 12px' }}>{schedError}</p>}
            <Btn size="sm" onClick={addGame}>{schedType === 'event' ? 'Add Event' : 'Add Game'}</Btn>
          </Card>
          <ScheduleList games={games} teams={draft.teams} session={session} editable={true}
            onRemove={id => onGamesChange(games.filter(g => g.id !== id))}
            onSaveScore={(id, a, b) => onGamesChange(games.map(g => g.id === id ? { ...g, scoreA: a, scoreB: b } : g))} />
        </div>
      )}

      {/* ── STANDINGS ── */}
      {tab === 'standings' && <Standings teams={draft.teams} games={games} />}

      {/* ── CHAT ── */}
      {tab === 'chat' && (
        <div>
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: '0.83rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Broadcast Message</div>
            <textarea value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Send a message to all players…" rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }} />
            <Btn size="sm" onClick={sendChat}>Send Message</Btn>
          </Card>
          {[...chat].sort((a, b) => b.ts - a.ts).length === 0
            ? <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5, fontSize: '0.9rem' }}>No messages yet.</div>
            : [...chat].sort((a, b) => b.ts - a.ts).map(m => (
              <div key={m.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', marginBottom: 10, boxShadow: '0 2px 8px rgba(13,33,54,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{m.name}</span>
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.65rem', opacity: 0.5 }}>{fmtChatTime(m.ts)}</span>
                </div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{m.message}</div>
                <button onClick={() => { const nc = chat.filter(c => c.id !== m.id); setChat(nc); dbSet('chat', nc); }}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: '#b23b3b', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Remove</button>
              </div>
            ))}
        </div>
      )}
    </Section>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────
const POLL_INTERVAL = 6000; // ms between sync polls
const DB_KEYS = ['players', 'organizers', 'draft', 'games', 'chat'] as const;

export default function App() {
  const [players, setPlayersRaw] = useState<Player[]>([]);
  const [organizers, setOrganizersRaw] = useState<Organizer[]>([]);
  const [draft, setDraftRaw] = useState<Draft>({ teams: TEAM_DEFS.map(t => ({ ...t, playerIds: [] })), pool: [] });
  const [games, setGamesRaw] = useState<Game[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setViewRaw] = useState<View>('home');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const lastWriteRef = useRef<number>(0); // suppress poll echo after local writes

  // ── Persist helpers ────────────────────────────────────────────────────────
  const setPlayers = useCallback((p: Player[]) => { setPlayersRaw(p); dbSet('players', p); lastWriteRef.current = Date.now(); }, []);
  const setOrganizers = useCallback((o: Organizer[]) => { setOrganizersRaw(o); dbSet('organizers', o); lastWriteRef.current = Date.now(); }, []);
  const setDraft = useCallback((d: Draft) => { setDraftRaw(d); dbSet('draft', d); lastWriteRef.current = Date.now(); }, []);
  const setGames = useCallback((g: Game[]) => { setGamesRaw(g); dbSet('games', g); lastWriteRef.current = Date.now(); }, []);

  // ── Initial load from server ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await dbGetAll([...DB_KEYS]);
        const p = (data['players'] as Player[] | null) ?? [];
        const o = (data['organizers'] as Organizer[] | null) ?? [];
        const g = (data['games'] as Game[] | null) ?? [];
        const rawDraft = (data['draft'] as Draft | null);
        const d: Draft = rawDraft || { teams: TEAM_DEFS.map(t => ({ ...t, playerIds: [] })), pool: p.map(pl => pl.id) };
        setPlayersRaw(p);
        setOrganizersRaw(o);
        setGamesRaw(g);
        setDraftRaw(d);
      } catch (e) {
        console.warn('Initial load failed, using localStorage fallback', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Poll for remote changes every POLL_INTERVAL ms ─────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      // Skip poll if we just wrote (avoid echoing our own change back)
      if (Date.now() - lastWriteRef.current < POLL_INTERVAL) return;
      setSyncing(true);
      try {
        const data = await dbGetAll([...DB_KEYS]);
        if (data['players'] !== null) setPlayersRaw(data['players'] as Player[]);
        if (data['organizers'] !== null) setOrganizersRaw(data['organizers'] as Organizer[]);
        if (data['games'] !== null) setGamesRaw(data['games'] as Game[]);
        if (data['draft'] !== null) setDraftRaw(data['draft'] as Draft);
      } catch {
        // silently ignore poll failures
      } finally {
        setSyncing(false);
      }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // ── Sync pool when players change ──────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const assigned = new Set<string>();
    draft.teams.forEach(t => t.playerIds.forEach(id => assigned.add(id)));
    const missing = players.filter(p => !assigned.has(p.id) && !draft.pool.includes(p.id));
    if (missing.length > 0) {
      const nd = { ...draft, pool: [...draft.pool, ...missing.map(p => p.id)] };
      setDraft(nd);
    }
  }, [players, loading]);

  const setView = (v: View) => { setViewRaw(v); window.scrollTo({ top: 0, behavior: 'instant' }); };

  const handleSignup = (player: Player) => {
    const exists = players.some(p => p.email === player.email);
    if (exists) { alert('That email already has an account. Try logging in.'); return; }
    const newPlayers = [...players, player];
    const newDraft = { ...draft, pool: [...draft.pool, player.id] };
    setPlayers(newPlayers);
    setDraft(newDraft);
    setSession({ type: 'player', id: player.id, name: player.name, email: player.email });
    setView('dashboard');
  };

  const handleRsvp = (gameId: string, status: 'yes' | 'no') => {
    if (!session) return;
    setGames(games.map(g => {
      if (g.id !== gameId) return g;
      const rsvps = { ...(g.rsvps || {}) };
      if (rsvps[session.id] === status) delete rsvps[session.id]; else rsvps[session.id] = status;
      return { ...g, rsvps };
    }));
  };

  const logout = () => { setSession(null); setView('home'); };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <img src={logoSrc} alt="BFL" style={{ width: 110, opacity: 0.9 }} />
        <div style={{ fontFamily: 'Anton, sans-serif', color: 'var(--cream)', fontSize: '1rem', letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      <Nav session={session} view={view} setView={setView} onLogout={logout} />
      {/* Sync indicator */}
      {syncing && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, background: 'var(--navy)', color: 'var(--teal-light)', fontFamily: 'Space Mono, monospace', fontSize: '0.68rem', padding: '6px 12px', borderRadius: 999, zIndex: 100, opacity: 0.85 }}>
          ↻ syncing
        </div>
      )}
      {view === 'home' && <HomeView setView={setView} />}
      {view === 'public' && <PublicView draft={draft} players={players} games={games} />}
      {view === 'signup' && <SignupView onSuccess={handleSignup} />}
      {view === 'login' && (
        <LoginView players={players} organizers={organizers}
          onPlayerLogin={s => { setSession(s); setView('dashboard'); }}
          onOrgLogin={s => { setSession(s); setView('organizer'); }}
          onOrgSignup={org => setOrganizers([...organizers, org])} />
      )}
      {view === 'dashboard' && session?.type === 'player' && (
        <PlayerDashboard session={session} draft={draft} players={players} games={games} onRsvp={handleRsvp} />
      )}
      {view === 'organizer' && session?.type === 'organizer' && (
        <OrganizerBoard session={session} draft={draft} players={players} games={games} organizers={organizers}
          onDraftChange={setDraft} onPlayersChange={setPlayers} onGamesChange={setGames}
          onOrgSignup={org => setOrganizers([...organizers, org])} />
      )}
    </div>
  );
}
