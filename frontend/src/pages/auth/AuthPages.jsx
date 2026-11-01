import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useTitle } from '../../lib/hooks';
import { Alert, CodeInput, Input, Logo, Spinner } from '../../components/ui';

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-night p-12 text-dawn lg:flex lg:flex-col">
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(50% 40% at 50% 55%, rgba(201,163,78,.18), transparent 70%)' }} />
        <Logo light size={44} />
        <div className="relative m-auto max-w-sm text-center">
          <img src="/brand/logo-512.png" alt="" className="mx-auto h-40 w-40 rounded-full" />
          <p className="mt-10 font-display text-3xl italic leading-snug text-gold-light">“If any of you lacks wisdom, you should ask God, who gives generously to all.”</p>
          <p className="mt-3 text-sm text-dawn/60">James 1:5</p>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden"><Logo size={38} /></div>
        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="font-display text-4xl font-semibold text-night">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

function PasswordInput({ label = 'Password', ...p }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={p.name}>{label}</label>
      <div className="relative">
        <input id={p.name} type={show ? 'text' : 'password'} className="input pr-11" {...p} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-muted hover:text-night" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}

const DevCode = ({ code }) => (code ? <Alert kind="info">Development mode: your code is <b>{code}</b></Alert> : null);

/* ------------------------------------------------------------------ register */
export function Register() {
  useTitle('Create account');
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { savePending } = useAuth();
  const { busy, error, run } = useAction();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', country: 'Kenya' });
  const academySlug = sp.get('academy') || undefined;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await post('/auth/register', { ...f, academySlug });
      savePending({ mfaToken: d.mfaToken, email: d.email, purpose: 'verify_email', devCode: d.devCode, next: sp.get('next') || (academySlug ? `/app/a/${academySlug}` : '/app') });
      nav('/verify-code');
    }).catch(() => {});
  };
  return (
    <AuthShell title="Create your account" subtitle="One account for every academy you belong to." footer={<>Already have an account? <Link to="/login" className="link">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Full name" name="fullName" autoComplete="name" required value={f.fullName} onChange={set('fullName')} />
        <Input label="Email" name="email" type="email" autoComplete="email" required value={f.email} onChange={set('email')} hint="We will send a 6-digit code to confirm it." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone (optional)" name="phone" type="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={f.phone} onChange={set('phone')} />
          <Input label="Country" name="country" autoComplete="country-name" value={f.country} onChange={set('country')} />
        </div>
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={set('password')} />
        <p className="-mt-2 text-xs text-ink-muted">At least 8 characters, including a letter and a number.</p>
        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ login */
export function Login() {
  useTitle('Sign in');
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { savePending, user } = useAuth();
  const { busy, error, run } = useAction();
  const [f, setF] = useState({ email: '', password: '' });
  useEffect(() => { if (user) nav(sp.get('next') || '/app', { replace: true }); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await post('/auth/login', f);
      savePending({ mfaToken: d.mfaToken, email: d.email, purpose: d.next === 'mfa' ? 'login' : 'verify_email', devCode: d.devCode, next: sp.get('next') || '/app' });
      nav('/verify-code');
    }).catch(() => {});
  };
  return (
    <AuthShell title="Welcome back" subtitle="Sign in, then enter the code we email you." footer={<>New to GenWise Africa? <Link to="/register" className="link">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Email" name="email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <PasswordInput name="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <div className="text-right text-sm"><Link to="/forgot-password" className="link">Forgot password?</Link></div>
        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Continue'}</button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ code step (verify email + login MFA) */
export function VerifyCode() {
  useTitle('Enter your code');
  const nav = useNavigate();
  const { readPending, savePending, clearPending, apply } = useAuth();
  const [pending, setPending] = useState(readPending());
  const [code, setCode] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const { busy, error, run, setError } = useAction();

  useEffect(() => { if (!pending) nav('/login', { replace: true }); }, [pending, nav]);
  useEffect(() => { if (cooldown <= 0) return undefined; const t = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  const verify = (value) => run(async () => {
    const path = pending.purpose === 'login' ? '/auth/verify-mfa' : '/auth/verify-email';
    const d = await post(path, { mfaToken: pending.mfaToken, code: value });
    apply(d);
    clearPending();
    nav(pending.next || '/app', { replace: true });
  }).catch(() => setCode(''));

  useEffect(() => { if (code.length === 6 && !busy) verify(code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const resend = () => run(async () => {
    const d = await post('/auth/resend-code', { mfaToken: pending.mfaToken });
    const p = { ...pending, mfaToken: d.mfaToken, devCode: d.devCode };
    savePending(p); setPending(p);
    setInfo('A new code is on its way. Check your inbox and spam folder.'); setError(null); setCooldown(60);
  }).catch(() => {});

  if (!pending) return null;
  const isLogin = pending.purpose === 'login';
  return (
    <AuthShell title={isLogin ? 'Check your email' : 'Verify your email'} subtitle={<>We sent a 6-digit code to <b className="text-night">{pending.email}</b>. It expires in 10 minutes.</>}
      footer={<Link to="/login" className="link" onClick={clearPending}>Use a different account</Link>}>
      <div className="space-y-5">
        <MailCheck className="mx-auto h-10 w-10 text-gold" aria-hidden />
        <Alert>{error}</Alert>
        <Alert kind="success">{info}</Alert>
        <DevCode code={pending.devCode} />
        <CodeInput value={code} onChange={setCode} />
        <button type="button" className="btn-primary w-full py-3" disabled={busy || code.length !== 6} onClick={() => verify(code)}>{busy ? <Spinner className="text-white" /> : isLogin ? 'Sign in' : 'Verify email'}</button>
        <p className="text-center text-sm text-ink-muted">
          Didn’t get it?{' '}
          {cooldown > 0 ? <span>Resend in {cooldown}s</span> : <button type="button" className="link" onClick={resend} disabled={busy}>Resend code</button>}
        </p>
      </div>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ forgot / reset */
export function ForgotPassword() {
  useTitle('Forgot password');
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await post('/auth/forgot-password', { email });
      sessionStorage.setItem('gw_reset', JSON.stringify({ email, devCode: d.devCode }));
      nav('/reset-password');
    }).catch(() => {});
  };
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a 6-digit reset code." footer={<Link to="/login" className="link">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Send reset code'}</button>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  useTitle('Choose a new password');
  const nav = useNavigate();
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('gw_reset') || '{}'); } catch { return {}; } })();
  const [f, setF] = useState({ email: saved.email || '', code: '', newPassword: '', confirm: '' });
  const [done, setDone] = useState(false);
  const { busy, error, run, setError } = useAction();
  const submit = (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) { setError('The two passwords do not match'); return; }
    run(async () => {
      await post('/auth/reset-password', { email: f.email, code: f.code, newPassword: f.newPassword });
      sessionStorage.removeItem('gw_reset');
      setDone(true);
      setTimeout(() => nav('/login'), 1800);
    }).catch(() => {});
  };
  return (
    <AuthShell title="Choose a new password" subtitle="Enter the code from your email and a new password." footer={<>No code? <Link to="/forgot-password" className="link">Send another</Link></>}>
      {done ? <Alert kind="success">Your password has been reset. Taking you to sign in…</Alert> : (
        <form onSubmit={submit} className="space-y-4">
          <Alert>{error}</Alert>
          <DevCode code={saved.devCode} />
          <Input label="Email" name="email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <div><span className="label">Reset code</span><CodeInput value={f.code} onChange={(code) => setF({ ...f, code })} autoFocus={!!f.email} /></div>
          <PasswordInput label="New password" name="newPassword" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
          <PasswordInput label="Confirm new password" name="confirm" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          <button type="submit" className="btn-primary w-full py-3" disabled={busy || f.code.length !== 6}>{busy ? <Spinner className="text-white" /> : 'Reset password'}</button>
        </form>
      )}
    </AuthShell>
  );
}
