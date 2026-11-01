import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Circle, Lock, PlayCircle, Sparkles, ChevronLeft, ChevronRight, Award, Plus, Pencil, FileText, Headphones, Video, ClipboardCheck, Download, Send } from 'lucide-react';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { post, openFile } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { Alert, Avatar, Badge, Empty, Markdown, Modal, PageLoader, ProgressBar, SectionHeader, Spinner, Input, Textarea } from '../../components/ui';
import { useAcademy, MembersOnly } from './AcademyContext';

const LESSON_ICON = { video: Video, audio: Headphones, text: FileText, pdf: FileText, live: PlayCircle, quiz: ClipboardCheck };

/* ================================================================== list */
export function CourseList() {
  const { slug, caps } = useAcademy();
  useTitle('Courses');
  const [showAll, setShowAll] = useState(!!caps.teach);
  const { data, loading } = useApi(`/t/${slug}/courses${showAll ? '?all=1' : ''}`, [showAll]);
  const [creating, setCreating] = useState(false);
  return (
    <MembersOnly>
      <SectionHeader title="Courses" action={caps.teach && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New course</button>}>
        Structured learning with lessons, assessments and certificates.
      </SectionHeader>
      {caps.teach && <label className="mb-5 flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Include drafts and archived courses</label>}
      {loading ? <PageLoader /> : data?.length ? (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <li key={c.id}>
              <Link to={c.slug} className="panel flex h-full flex-col overflow-hidden hover:border-gold/60">
                {c.coverUrl ? <img src={c.coverUrl} alt="" className="h-36 w-full object-cover" /> : <div className="flex h-36 items-end bg-night p-5"><BookOpen className="h-8 w-8 text-gold" /></div>}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap gap-1.5">{c.status !== 'published' && <Badge tone="gold">{c.status}</Badge>}<Badge>{c.category}</Badge><Badge>{c.level}</Badge></div>
                  <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-night">{c.title}</h2>
                  {c.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{c.summary}</p>}
                  <div className="mt-auto pt-4">
                    {c.enrollment ? <><ProgressBar value={c.enrollment.progressPct} /><p className="mt-1.5 text-xs text-ink-muted">{c.enrollment.completedAt ? 'Completed' : `${c.enrollment.progressPct}% complete`}</p></>
                      : <p className="text-xs text-ink-muted">{c.lessonCount} lessons · {c.instructor?.fullName}</p>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : <Empty icon={BookOpen} title="No courses yet" action={caps.teach && <button type="button" className="btn-primary" onClick={() => setCreating(true)}>Create the first course</button>}>{caps.teach ? 'Create a course, add lessons, then publish it for your members.' : 'Your academy has not published any courses yet.'}</Empty>}
      <NewCourseModal open={creating} onClose={() => setCreating(false)} />
    </MembersOnly>
  );
}

function NewCourseModal({ open, onClose }) {
  const { slug } = useAcademy();
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', summary: '', category: 'Discipleship', level: 'beginner' });
  const { busy, error, run } = useAction();
  const submit = (e) => { e.preventDefault(); run(async () => { const c = await post(`/t/${slug}/courses`, f); nav(`/app/a/${slug}/studio/${c.id}`); }).catch(() => {}); };
  return (
    <Modal open={open} onClose={onClose} title="New course">
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Course title" name="title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label="Summary" name="summary" rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Category" name="category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <div><label className="label" htmlFor="level">Level</label><select id="level" className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Create and add lessons'}</button>
      </form>
    </Modal>
  );
}

/* ================================================================== detail */
export function CourseDetail() {
  const { slug } = useAcademy();
  const { courseId } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi(`/t/${slug}/courses/${courseId}`);
  const { busy, error: enrollErr, run } = useAction();
  useTitle(data?.course?.title);
  if (loading) return <PageLoader />;
  if (error) return <Empty title="Course not found">{error.message}</Empty>;
  const { course, enrollment, completedLessonIds, certificate, enrolledCount, canEdit } = data;
  const done = new Set(completedLessonIds);
  const lessons = course.modules.flatMap((m) => m.lessons);
  const next = lessons.find((l) => !done.has(l.id)) || lessons[0];
  const enroll = () => run(async () => { await post(`/t/${slug}/courses/${course.id}/enroll`); await reload(); if (next) nav(`/app/a/${slug}/learn/${next.id}`); }).catch(() => {});
  return (
    <MembersOnly>
      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Link to=".." relative="path" className="text-sm text-ink-muted hover:text-night">Courses</Link>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-tight text-night">{course.title}</h1>
          {course.summary && <p className="mt-3 text-lg text-ink-muted">{course.summary}</p>}
          {course.description && <div className="mt-6"><Markdown>{course.description}</Markdown></div>}
          <h2 className="mt-10 font-display text-3xl font-semibold text-night">Course outline</h2>
          <div className="mt-4 space-y-5">
            {course.modules.map((m, mi) => (
              <section key={m.id} className="panel overflow-hidden">
                <h3 className="border-b border-dawn-200 bg-dawn/60 px-5 py-3 font-semibold text-night">Part {mi + 1}: {m.title}</h3>
                <ul>
                  {m.lessons.map((l) => {
                    const Icon = LESSON_ICON[l.type] || FileText;
                    const open = enrollment || l.isPreview || canEdit;
                    return (
                      <li key={l.id} className="border-b border-dawn-200 last:border-0">
                        {open ? (
                          <Link to={`/app/a/${slug}/learn/${l.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-dawn/50">
                            {done.has(l.id) ? <CheckCircle2 className="h-5 w-5 text-emerald" /> : <Icon className="h-5 w-5 text-ink-soft" />}
                            <span className="flex-1 text-night">{l.title}</span>
                            {l.isPreview && !enrollment && <Badge tone="gold">Preview</Badge>}
                            <span className="text-xs text-ink-muted">{l.durationMin} min</span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-3 text-ink-muted"><Lock className="h-4 w-4" /><span className="flex-1">{l.title}</span><span className="text-xs">{l.durationMin} min</span></div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {course.assessments.length > 0 && (
              <section className="panel p-5">
                <h3 className="font-semibold text-night">Assessments</h3>
                <ul className="mt-2 space-y-2">{course.assessments.map((a) => <li key={a.id}>{enrollment || canEdit ? <Link className="link" to={`/app/a/${slug}/assessments/${a.id}`}>{a.title}</Link> : a.title}{a.isFinal && <span className="ml-2"><Badge tone="gold">Final</Badge></span>} <span className="text-xs text-ink-muted">pass mark {a.passMark}%</span></li>)}</ul>
              </section>
            )}
          </div>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="panel p-6">
            {certificate ? (
              <div className="mb-5 rounded-2xl bg-night p-5 text-dawn"><Award className="h-7 w-7 text-gold" /><p className="mt-2 font-display text-2xl font-semibold text-gold-light">Course completed</p><button type="button" className="btn-gold btn-sm mt-3" onClick={() => openFile(`/me/certificates/${certificate.id}/pdf`)}><Download className="h-3.5 w-3.5" />Download certificate</button></div>
            ) : enrollment ? (
              <div className="mb-5"><ProgressBar value={enrollment.progressPct} /><p className="mt-2 text-sm text-ink-muted">{enrollment.progressPct}% complete</p></div>
            ) : null}
            <Alert>{enrollErr}</Alert>
            {enrollment ? (next && <Link to={`/app/a/${slug}/learn/${enrollment.lastLessonId || next.id}`} className="btn-primary w-full">{enrollment.progressPct ? 'Continue learning' : 'Start course'}</Link>)
              : course.status === 'published' ? <button type="button" className="btn-primary w-full" onClick={enroll} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Enrol for free'}</button> : <p className="text-sm text-ink-muted">This course is a {course.status} and not open for enrolment.</p>}
            {canEdit && <Link to={`/app/a/${slug}/studio/${course.id}`} className="btn-outline mt-3 w-full"><Pencil className="h-4 w-4" />Edit in studio</Link>}
            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Lessons</dt><dd className="text-night">{lessons.length}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Estimated time</dt><dd className="text-night">{course.estimatedHours} h</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Level</dt><dd className="capitalize text-night">{course.level}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Learners</dt><dd className="text-night">{enrolledCount}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Certificate</dt><dd className="text-night">{course.certificateEnabled ? 'Yes' : 'No'}</dd></div>
            </dl>
            {course.instructor && <div className="mt-6 flex items-center gap-3 border-t border-dawn-200 pt-5"><Avatar name={course.instructor.fullName} src={course.instructor.avatarUrl} /><div><p className="text-sm font-semibold text-night">{course.instructor.fullName}</p><p className="text-xs text-ink-muted">Instructor</p></div></div>}
          </div>
        </aside>
      </div>
    </MembersOnly>
  );
}

/* ================================================================== lesson player + AI guide */
function MediaBlock({ lesson }) {
  const url = lesson.mediaUrl;
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (yt) return <div className="aspect-video overflow-hidden rounded-2xl bg-night"><iframe title={lesson.title} src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} className="h-full w-full" allowFullScreen allow="accelerometer; encrypted-media; picture-in-picture" /></div>;
  if (vimeo) return <div className="aspect-video overflow-hidden rounded-2xl bg-night"><iframe title={lesson.title} src={`https://player.vimeo.com/video/${vimeo[1]}`} className="h-full w-full" allowFullScreen /></div>;
  if (lesson.type === 'audio') return <audio controls src={url} className="w-full" preload="metadata" />;
  if (lesson.type === 'pdf') return <div className="overflow-hidden rounded-2xl border border-dawn-200"><iframe title={lesson.title} src={url} className="h-[70vh] w-full" /><a href={url} target="_blank" rel="noreferrer" className="block bg-dawn px-4 py-2 text-sm link">Open PDF in a new tab</a></div>;
  if (lesson.type === 'video') return <video controls src={url} className="w-full rounded-2xl bg-night" preload="metadata" />;
  return <a href={url} target="_blank" rel="noreferrer" className="link">Open lesson resource</a>;
}

const AI_MODES = [
  { mode: 'summarize', label: 'Summarise' },
  { mode: 'explain', label: 'Explain simply' },
  { mode: 'quiz', label: 'Quiz me' },
  { mode: 'apply', label: 'Apply to my life' },
  { mode: 'scripture', label: 'Related Scripture' },
];

function AiGuide({ lessonId }) {
  const { slug } = useAcademy();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => { setItems([]); }, [lessonId]);
  const ask = (mode, question) => run(async () => {
    const label = question || AI_MODES.find((m) => m.mode === mode)?.label;
    setItems((x) => [...x, { role: 'me', text: label }]);
    const d = await post(`/t/${slug}/ai/lesson/${lessonId}`, { mode, question });
    setItems((x) => [...x, { role: 'ai', text: d.answer }]);
    setQ('');
  }).catch(() => setItems((x) => x.slice(0, -1)));
  return (
    <aside className="panel flex max-h-[80vh] flex-col overflow-hidden" aria-label="AI Study Guide">
      <div className="border-b border-dawn-200 px-5 py-4">
        <p className="flex items-center gap-2 font-display text-2xl font-semibold text-night"><Sparkles className="h-5 w-5 text-gold-deep" />Study Guide</p>
        <p className="text-xs text-ink-muted">Answers come from this lesson. For pastoral questions, talk with your instructor or mentor.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {!items.length && <p className="text-sm text-ink-muted">Choose how you would like help with this lesson, or ask your own question.</p>}
        {items.map((m, i) => (m.role === 'me'
          ? <div key={i} className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-night px-3.5 py-2 text-sm text-dawn">{m.text}</div>
          : <div key={i} className="rounded-2xl rounded-bl-md bg-dawn px-4 py-3 text-sm"><Markdown className="prose-gw text-sm [&_h2]:text-xl [&_h3]:text-lg">{m.text}</Markdown></div>))}
        {busy && <div className="flex items-center gap-2 text-sm text-ink-muted"><Spinner className="h-4 w-4" />Thinking…</div>}
        <Alert>{error}</Alert>
      </div>
      <div className="border-t border-dawn-200 p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">{AI_MODES.map((m) => <button key={m.mode} type="button" className="chip border border-dawn-300 bg-white text-night hover:border-gold" onClick={() => ask(m.mode)} disabled={busy}>{m.label}</button>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask('ask', q.trim()); }}>
          <input className="input py-2 text-sm" placeholder="Ask about this lesson" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask the study guide" />
          <button type="submit" className="btn-primary px-3" disabled={busy || !q.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
        </form>
      </div>
    </aside>
  );
}

export function LessonPlayer() {
  const { slug } = useAcademy();
  const { lessonId } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi(`/t/${slug}/lessons/${lessonId}`, [lessonId]);
  const { busy, run } = useAction();
  const [result, setResult] = useState(null);
  const [showAi, setShowAi] = useState(false);
  useTitle(data?.lesson?.title);
  useEffect(() => { setResult(null); window.scrollTo(0, 0); }, [lessonId]);
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty icon={Lock} title="Lesson locked">{error.message}</Empty>;
  const { lesson, course, prevId, nextId, completed, enrolled, meeting } = data;
  const complete = () => run(async () => {
    const r = await post(`/t/${slug}/lessons/${lesson.id}/complete`);
    setResult(r); await reload();
    if (nextId && !r.completed) nav(`/app/a/${slug}/learn/${nextId}`);
  }).catch(() => {});
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <article>
        <Link to={`/app/a/${slug}/courses/${course.slug}`} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-night"><ChevronLeft className="h-4 w-4" />{course.title}</Link>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-night sm:text-5xl">{lesson.title}</h1>
        {lesson.scriptureRefs && <p className="mt-2 font-display text-lg italic text-gold-deep">{lesson.scriptureRefs}</p>}
        <div className="mt-6 space-y-6">
          <MediaBlock lesson={lesson} />
          {meeting && (
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <div><p className="font-semibold text-night">{meeting.title}</p><p className="text-sm text-ink-muted">{fmtDateTime(meeting.startsAt)}</p></div>
              {meeting.recordingUrl ? <a className="btn-outline" href={meeting.recordingUrl} target="_blank" rel="noreferrer">Watch recording</a> : <Link className="btn-primary" to={`/app/a/${slug}/meetings/${meeting.id}`}>Go to live class</Link>}
            </div>
          )}
          {lesson.content && <Markdown>{lesson.content}</Markdown>}
          {lesson.assessmentId && <Link to={`/app/a/${slug}/assessments/${lesson.assessmentId}`} className="btn-primary"><ClipboardCheck className="h-4 w-4" />Take the assessment</Link>}
        </div>
        {result?.completed && <div className="mt-8"><Alert kind="success">You have completed this course{result.certificate ? ' and earned a certificate. Find it under Certificates.' : '.'}</Alert></div>}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-dawn-200 pt-6">
          {prevId ? <Link to={`/app/a/${slug}/learn/${prevId}`} className="btn-outline"><ChevronLeft className="h-4 w-4" />Previous</Link> : <span />}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline xl:hidden" onClick={() => setShowAi(true)}><Sparkles className="h-4 w-4" />Study Guide</button>
            {enrolled && (completed
              ? (nextId ? <Link to={`/app/a/${slug}/learn/${nextId}`} className="btn-primary">Next lesson<ChevronRight className="h-4 w-4" /></Link> : <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald"><CheckCircle2 className="h-4 w-4" />Completed</span>)
              : <button type="button" className="btn-primary" onClick={complete} disabled={busy}>{busy ? <Spinner className="text-white" /> : nextId ? 'Mark complete and continue' : 'Mark complete'}</button>)}
          </div>
        </div>
      </article>
      <div className="hidden xl:block xl:sticky xl:top-20 xl:self-start"><AiGuide lessonId={lesson.id} /></div>
      <Modal open={showAi} onClose={() => setShowAi(false)} title="Study Guide" wide><AiGuide lessonId={lesson.id} /></Modal>
    </div>
  );
}

/* ================================================================== assessment */
export function AssessmentPage() {
  const { slug } = useAcademy();
  const { assessmentId } = useParams();
  const { data, loading, error, reload } = useApi(`/t/${slug}/assessments/${assessmentId}`);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const { busy, error: subErr, run } = useAction();
  useTitle(data?.assessment?.title);
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty title="Assessment unavailable">{error.message}</Empty>;
  const { assessment: a, questions, attempts, attemptsLeft, course, canEdit } = data;
  const best = attempts.reduce((m, s) => Math.max(m, s.score), 0);
  const passed = attempts.some((s) => s.passed);
  const submit = (e) => { e.preventDefault(); run(async () => { const r = await post(`/t/${slug}/assessments/${a.id}/submit`, { answers }); setResult(r); await reload(); window.scrollTo(0, 0); }).catch(() => {}); };
  const setA = (qid, v) => setAnswers((x) => ({ ...x, [qid]: v }));
  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/app/a/${slug}/courses/${course.slug}`} className="text-sm text-ink-muted hover:text-night">{course.title}</Link>
      <h1 className="mt-2 font-display text-5xl font-semibold text-night">{a.title}</h1>
      <p className="mt-2 text-ink-muted">Pass mark {a.passMark}% · {attemptsLeft} of {a.maxAttempts} attempts left{attempts.length ? ` · best score ${best}%` : ''}</p>
      {a.description && <p className="mt-4 text-ink">{a.description}</p>}
      {canEdit && <Link to={`/app/a/${slug}/studio/${course.id}`} className="btn-outline btn-sm mt-4">Edit questions and grade submissions</Link>}
      {result && (
        <div className={`mt-6 rounded-2xl p-6 ${result.submission.status === 'pending' ? 'bg-gold-pale/60' : result.submission.passed ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <p className="font-display text-3xl font-semibold text-night">{result.submission.status === 'pending' ? 'Submitted for grading' : result.submission.passed ? `Well done, you passed with ${result.submission.score}%` : `You scored ${result.submission.score}%`}</p>
          <p className="mt-1 text-sm text-ink-muted">{result.submission.status === 'pending' ? 'Your instructor will grade the written answers and you will be notified.' : result.submission.passed ? (result.progress.certificate ? 'Your certificate is ready under Certificates.' : 'Keep going with the rest of the course.') : attemptsLeft > 0 ? 'Review the explanations below and try again.' : 'You have used all attempts. Speak to your instructor.'}</p>
        </div>
      )}
      {passed && !result && <div className="mt-6"><Alert kind="success">You have passed this assessment.</Alert></div>}
      {attemptsLeft > 0 && !(passed && !result) ? (
        <form onSubmit={submit} className="mt-8 space-y-5">
          {questions.map((q, i) => {
            const rv = result?.review?.[q.id];
            return (
              <fieldset key={q.id} className={`panel p-5 ${rv?.correct === true ? 'border-emerald/40' : rv?.correct === false ? 'border-red-200' : ''}`}>
                <legend className="sr-only">Question {i + 1}</legend>
                <p className="font-medium text-night"><span className="mr-2 text-gold-deep">{i + 1}.</span>{q.prompt}</p>
                <div className="mt-3 space-y-2">
                  {['single', 'truefalse'].includes(q.type) && q.options.map((o, oi) => (
                    <label key={oi} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dawn-200 px-3.5 py-2.5 hover:border-gold/60 has-[:checked]:border-emerald has-[:checked]:bg-emerald-50">
                      <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setA(q.id, oi)} className="accent-emerald" />{o}
                    </label>
                  ))}
                  {q.type === 'multi' && q.options.map((o, oi) => (
                    <label key={oi} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dawn-200 px-3.5 py-2.5 has-[:checked]:border-emerald has-[:checked]:bg-emerald-50">
                      <input type="checkbox" checked={(answers[q.id] || []).includes(oi)} onChange={(e) => setA(q.id, e.target.checked ? [...(answers[q.id] || []), oi] : (answers[q.id] || []).filter((x) => x !== oi))} className="accent-emerald" />{o}
                    </label>
                  ))}
                  {q.type === 'short' && <input className="input" value={answers[q.id] || ''} onChange={(e) => setA(q.id, e.target.value)} aria-label="Your answer" />}
                  {q.type === 'essay' && <textarea className="input" rows={5} value={answers[q.id] || ''} onChange={(e) => setA(q.id, e.target.value)} aria-label="Your answer" />}
                </div>
                {rv?.explanation && <p className="mt-3 text-sm text-ink-muted">{rv.explanation}</p>}
              </fieldset>
            );
          })}
          <Alert>{subErr}</Alert>
          {questions.length ? <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Submit answers'}</button> : <p className="text-ink-muted">No questions have been added yet.</p>}
        </form>
      ) : null}
    </div>
  );
}
