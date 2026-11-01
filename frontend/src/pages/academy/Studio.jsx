import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, Upload, Sparkles, Eye, ClipboardCheck, GripVertical } from 'lucide-react';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { get, post, patch, del, upload } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { Alert, Badge, Empty, Input, Modal, PageLoader, Select, Spinner, Tabs, Textarea, useToast } from '../../components/ui';
import { useAcademy } from './AcademyContext';

export function UploadButton({ kind, onUploaded, label = 'Upload' }) {
  const { slug } = useAcademy();
  const { busy, error, run } = useAction();
  const accept = { image: 'image/*', audio: 'audio/*', video: 'video/*', document: 'application/pdf' }[kind];
  return (
    <span className="inline-flex flex-col">
      <label className="btn-outline btn-sm cursor-pointer">
        {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-3.5 w-3.5" />}{label}
        <input type="file" accept={accept} className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) run(async () => onUploaded((await upload(slug, kind, f)).url)).catch(() => {}); e.target.value = ''; }} />
      </label>
      {error && <span className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ lesson editor */
function LessonModal({ open, onClose, lesson, moduleId, onSaved }) {
  const { slug } = useAcademy();
  const blank = { title: '', type: 'text', content: '', mediaUrl: '', durationMin: 10, isPreview: false, scriptureRefs: '' };
  const [f, setF] = useState(lesson || blank);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...f, durationMin: parseInt(f.durationMin, 10) || 0 };
      if (lesson?.id) await patch(`/t/${slug}/lessons/${lesson.id}`, body); else await post(`/t/${slug}/modules/${moduleId}/lessons`, body);
      onSaved(); onClose();
    }).catch(() => {});
  };
  const kind = { video: 'video', audio: 'audio', pdf: 'document' }[f.type];
  return (
    <Modal open={open} onClose={onClose} title={lesson?.id ? 'Edit lesson' : 'New lesson'} wide>
      <form onSubmit={save} className="space-y-4">
        <Alert>{error}</Alert>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Input label="Title" name="title" required value={f.title} onChange={set('title')} />
          <Select label="Type" name="type" value={f.type} onChange={set('type')} options={[{ value: 'text', label: 'Reading' }, { value: 'video', label: 'Video' }, { value: 'audio', label: 'Audio' }, { value: 'pdf', label: 'PDF' }, { value: 'live', label: 'Live class' }]} />
          <Input label="Minutes" name="durationMin" type="number" min="0" value={f.durationMin} onChange={set('durationMin')} />
        </div>
        {kind && (
          <div>
            <label className="label" htmlFor="mediaUrl">{f.type === 'video' ? 'Video link (YouTube, Vimeo) or upload' : f.type === 'audio' ? 'Audio link or upload' : 'PDF link or upload'}</label>
            <div className="flex flex-wrap items-start gap-2"><input id="mediaUrl" className="input flex-1" value={f.mediaUrl || ''} onChange={set('mediaUrl')} placeholder="https://" /><UploadButton kind={kind} onUploaded={(url) => setF((x) => ({ ...x, mediaUrl: url }))} /></div>
          </div>
        )}
        <Textarea label="Lesson content" name="content" rows={10} value={f.content || ''} onChange={set('content')} hint="Use Markdown: ## for headings, **bold**, - for bullet points, > for Scripture quotes. The AI Study Guide reads this text." />
        <Input label="Scripture references" name="scriptureRefs" placeholder="e.g. Proverbs 9:10; James 1:5" value={f.scriptureRefs || ''} onChange={set('scriptureRefs')} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.isPreview} onChange={set('isPreview')} className="accent-emerald" />Free preview (visible before enrolling)</label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Save lesson'}</button>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ questions */
function QuestionEditor({ assessment, onChange }) {
  const { slug } = useAcademy();
  const { data, reload } = useApi(`/t/${slug}/assessments/${assessment.id}`);
  const [f, setF] = useState({ type: 'single', prompt: '', options: ['', '', '', ''], answer: 0, explanation: '' });
  const [aiTopic, setAiTopic] = useState('');
  const a = useAction(); const ai = useAction();
  const [drafts, setDrafts] = useState([]);
  const add = (e) => {
    e.preventDefault();
    a.run(async () => {
      const opts = f.type === 'truefalse' ? ['True', 'False'] : ['single', 'multi'].includes(f.type) ? f.options.filter((o) => o.trim()) : [];
      await post(`/t/${slug}/assessments/${assessment.id}/questions`, { ...f, options: opts, answer: f.type === 'short' ? f.answer : f.type === 'essay' ? null : f.type === 'multi' ? String(f.answer).split(',').map((x) => parseInt(x, 10) - 1) : Number(f.answer) });
      setF({ ...f, prompt: '', options: ['', '', '', ''], explanation: '' }); reload(); onChange?.();
    }).catch(() => {});
  };
  const draft = () => ai.run(async () => setDrafts(await post(`/t/${slug}/ai/quiz-draft`, { topic: aiTopic, count: 5 }))).catch(() => {});
  const accept = (q) => a.run(async () => { await post(`/t/${slug}/assessments/${assessment.id}/questions`, { type: 'single', ...q }); setDrafts((d) => d.filter((x) => x !== q)); reload(); }).catch(() => {});
  return (
    <div className="space-y-6">
      <ol className="space-y-3">
        {(data?.questions || []).map((q, i) => (
          <li key={q.id} className="flex gap-3 rounded-xl border border-dawn-200 p-4">
            <span className="font-semibold text-gold-deep">{i + 1}.</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-night">{q.prompt} <Badge>{q.type}</Badge></p>
              {q.options?.length > 0 && <ul className="mt-1 text-ink-muted">{q.options.map((o, oi) => <li key={oi} className={(Array.isArray(q.answer) ? q.answer.includes(oi) : q.answer === oi) ? 'font-semibold text-emerald' : ''}>{String.fromCharCode(65 + oi)}. {o}</li>)}</ul>}
            </div>
            <button type="button" className="text-ink-soft hover:text-red-600" aria-label="Delete question" onClick={async () => { await del(`/t/${slug}/questions/${q.id}`); reload(); }}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {!data?.questions?.length && <p className="text-sm text-ink-muted">No questions yet.</p>}
      </ol>
      <form onSubmit={add} className="space-y-3 rounded-2xl bg-dawn/60 p-4">
        <p className="font-semibold text-night">Add a question</p>
        <Alert>{a.error}</Alert>
        <div className="grid gap-3 sm:grid-cols-[1fr_3fr]">
          <Select name="qtype" label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, answer: e.target.value === 'short' ? '' : 0 })} options={[{ value: 'single', label: 'Multiple choice' }, { value: 'multi', label: 'Select all that apply' }, { value: 'truefalse', label: 'True / false' }, { value: 'short', label: 'Short answer' }, { value: 'essay', label: 'Essay (manual)' }]} />
          <Input name="prompt" label="Question" required value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} />
        </div>
        {['single', 'multi'].includes(f.type) && <div className="grid gap-2 sm:grid-cols-2">{f.options.map((o, i) => <input key={i} className="input" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={o} onChange={(e) => { const opts = [...f.options]; opts[i] = e.target.value; setF({ ...f, options: opts }); }} />)}</div>}
        {f.type === 'single' && <Select name="answer" label="Correct option" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} options={f.options.map((o, i) => ({ value: i, label: `${String.fromCharCode(65 + i)}${o ? `: ${o}` : ''}` }))} />}
        {f.type === 'multi' && <Input name="answer" label="Correct options (numbers, e.g. 1,3)" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />}
        {f.type === 'truefalse' && <Select name="answer" label="Correct answer" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} options={[{ value: 0, label: 'True' }, { value: 1, label: 'False' }]} />}
        {f.type === 'short' && <Input name="answer" label="Accepted answers (separate with |)" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />}
        <Input name="explanation" label="Explanation shown after answering (optional)" value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} />
        <button type="submit" className="btn-primary btn-sm" disabled={a.busy}>Add question</button>
      </form>
      <div className="space-y-3 rounded-2xl border border-gold/40 p-4">
        <p className="flex items-center gap-2 font-semibold text-night"><Sparkles className="h-4 w-4 text-gold-deep" />Draft questions with AI</p>
        <Textarea name="aiTopic" rows={3} placeholder="Paste lesson text or describe the topic" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} />
        <Alert>{ai.error}</Alert>
        <button type="button" className="btn-outline btn-sm" disabled={ai.busy || !aiTopic.trim()} onClick={draft}>{ai.busy ? <Spinner className="h-4 w-4" /> : 'Draft 5 questions'}</button>
        {drafts.map((q, i) => (
          <div key={i} className="rounded-xl bg-dawn/60 p-3 text-sm">
            <p className="font-medium text-night">{q.prompt}</p>
            <ul className="text-ink-muted">{(q.options || []).map((o, oi) => <li key={oi} className={oi === q.answer ? 'font-semibold text-emerald' : ''}>{String.fromCharCode(65 + oi)}. {o}</li>)}</ul>
            <button type="button" className="btn-primary btn-sm mt-2" onClick={() => accept(q)}>Add this question</button>
          </div>
        ))}
        <p className="text-xs text-ink-muted">Always review AI drafts for accuracy before learners see them.</p>
      </div>
    </div>
  );
}

function Submissions({ assessment }) {
  const { slug } = useAcademy();
  const { data, reload } = useApi(`/t/${slug}/assessments/${assessment.id}/submissions`);
  const qs = useApi(`/t/${slug}/assessments/${assessment.id}`);
  const [grading, setGrading] = useState(null);
  const [g, setG] = useState({ score: '', feedback: '' });
  const qmap = Object.fromEntries((qs.data?.questions || []).map((q) => [q.id, q]));
  return (
    <div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-dawn-200 text-left text-ink-muted"><th className="py-2">Learner</th><th>Attempt</th><th>Score</th><th>Status</th><th /></tr></thead>
        <tbody>
          {(data || []).map((s) => (
            <tr key={s.id} className="border-b border-dawn-200">
              <td className="py-2.5"><p className="text-night">{s.User?.fullName}</p><p className="text-xs text-ink-muted">{fmtDateTime(s.createdAt)}</p></td>
              <td>{s.attempt}</td><td>{s.score}%</td>
              <td>{s.status === 'pending' ? <Badge tone="gold">Needs grading</Badge> : s.passed ? <Badge tone="emerald">Passed</Badge> : <Badge>Not passed</Badge>}</td>
              <td className="text-right"><button type="button" className="btn-ghost btn-sm" onClick={() => { setGrading(s); setG({ score: s.score, feedback: s.feedback || '' }); }}>Review</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data?.length && <p className="py-6 text-center text-sm text-ink-muted">No submissions yet.</p>}
      <Modal open={!!grading} onClose={() => setGrading(null)} title={`Review: ${grading?.User?.fullName || ''}`} wide>
        {grading && (
          <div className="space-y-4">
            {Object.entries(grading.answers || {}).map(([qid, ans]) => (
              <div key={qid} className="rounded-xl bg-dawn/60 p-3 text-sm"><p className="font-medium text-night">{qmap[qid]?.prompt}</p><p className="mt-1 whitespace-pre-line text-ink">{Array.isArray(ans) ? ans.map((x) => qmap[qid]?.options?.[x]).join(', ') : typeof ans === 'number' ? qmap[qid]?.options?.[ans] : String(ans)}</p></div>
            ))}
            <Input label="Score (%)" name="score" type="number" min="0" max="100" value={g.score} onChange={(e) => setG({ ...g, score: e.target.value })} />
            <Textarea label="Feedback" name="feedback" value={g.feedback} onChange={(e) => setG({ ...g, feedback: e.target.value })} />
            <button type="button" className="btn-primary" onClick={async () => { await patch(`/t/${slug}/submissions/${grading.id}/grade`, g); setGrading(null); reload(); }}>Save grade</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ studio page */
export default function Studio() {
  const { slug } = useAcademy();
  const { courseId } = useParams();
  const { data, loading, error, reload } = useApi(`/t/${slug}/courses/${courseId}`);
  const [tab, setTab] = useState('outline');
  const [lessonModal, setLessonModal] = useState(null);
  const [newModule, setNewModule] = useState('');
  const [meta, setMeta] = useState(null);
  const [newAssess, setNewAssess] = useState({ title: '', passMark: 70, maxAttempts: 3, isFinal: true });
  const [openAssess, setOpenAssess] = useState(null);
  const act = useAction();
  const { toast, toastEl } = useToast();
  useTitle(data?.course ? `Studio: ${data.course.title}` : 'Studio');
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty title="Course not found">{error.message}</Empty>;
  const { course, canEdit } = data;
  if (!canEdit) return <Empty title="Not allowed">Only the instructor or academy admins can edit this course.</Empty>;
  const m = meta || course;
  const saveMeta = (e) => { e.preventDefault(); act.run(async () => { await patch(`/t/${slug}/courses/${course.id}`, { title: m.title, summary: m.summary, description: m.description, category: m.category, level: m.level, estimatedHours: m.estimatedHours, coverUrl: m.coverUrl, certificateEnabled: m.certificateEnabled }); setMeta(null); await reload(); toast('Course details saved'); }).catch(() => {}); };
  const setStatus = (status) => act.run(async () => { await patch(`/t/${slug}/courses/${course.id}`, { status }); await reload(); toast(status === 'published' ? 'Course published' : `Course moved to ${status}`); }).catch(() => {});
  const lessonCount = course.modules.reduce((n, x) => n + x.lessons.length, 0);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">Course studio</p>
          <h1 className="font-display text-4xl font-semibold text-night">{course.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted"><Badge tone={course.status === 'published' ? 'emerald' : 'gold'}>{course.status}</Badge>{lessonCount} lessons</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/app/a/${slug}/courses/${course.slug}`} className="btn-outline"><Eye className="h-4 w-4" />View as learner</Link>
          {course.status !== 'published' ? <button type="button" className="btn-primary" onClick={() => setStatus('published')} disabled={act.busy}>Publish course</button> : <button type="button" className="btn-outline" onClick={() => setStatus('draft')}>Unpublish</button>}
        </div>
      </div>
      <Alert>{act.error}</Alert>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'outline', label: 'Outline' }, { value: 'assess', label: 'Assessments', count: course.assessments.length }, { value: 'details', label: 'Details' }]} />

      {tab === 'outline' && (
        <div className="space-y-5">
          {course.modules.map((mod, mi) => (
            <section key={mod.id} className="panel">
              <div className="flex items-center justify-between gap-3 border-b border-dawn-200 px-5 py-3">
                <h2 className="font-semibold text-night">Part {mi + 1}: {mod.title}</h2>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={async () => { const t = window.prompt('Rename module', mod.title); if (t) { await patch(`/t/${slug}/modules/${mod.id}`, { title: t }); reload(); } }}><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" className="btn-ghost btn-sm text-red-700" onClick={async () => { if (window.confirm('Delete this module and its lessons?')) { await del(`/t/${slug}/modules/${mod.id}`); reload(); } }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <ul>
                {mod.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-b border-dawn-200 px-5 py-2.5 last:border-0">
                    <GripVertical className="h-4 w-4 text-ink-soft" />
                    <span className="flex-1 text-night">{l.title}</span>
                    <Badge>{l.type}</Badge>{l.isPreview && <Badge tone="gold">preview</Badge>}
                    <button type="button" className="btn-ghost btn-sm" onClick={async () => { const full = await get(`/t/${slug}/lessons/${l.id}`); setLessonModal({ moduleId: mod.id, lesson: full.lesson }); }}>Edit</button>
                    <button type="button" className="text-ink-soft hover:text-red-600" aria-label="Delete lesson" onClick={async () => { if (window.confirm('Delete this lesson?')) { await del(`/t/${slug}/lessons/${l.id}`); reload(); } }}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
              <div className="px-5 py-3"><button type="button" className="btn-ghost btn-sm text-emerald" onClick={() => setLessonModal({ moduleId: mod.id, lesson: null })}><Plus className="h-4 w-4" />Add lesson</button></div>
            </section>
          ))}
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!newModule.trim()) return; await post(`/t/${slug}/courses/${course.id}/modules`, { title: newModule }); setNewModule(''); reload(); }}>
            <input className="input" placeholder={course.modules.length ? 'New module title' : 'Start with a module, e.g. "Introduction"'} value={newModule} onChange={(e) => setNewModule(e.target.value)} aria-label="New module title" />
            <button type="submit" className="btn-primary"><Plus className="h-4 w-4" />Add module</button>
          </form>
        </div>
      )}

      {tab === 'assess' && (
        <div className="space-y-5">
          {course.assessments.map((as) => (
            <section key={as.id} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="flex items-center gap-2 font-semibold text-night"><ClipboardCheck className="h-4 w-4 text-gold-deep" />{as.title}{as.isFinal && <Badge tone="gold">Final</Badge>}</h2><p className="text-xs text-ink-muted">Pass mark {as.passMark}% · {as.maxAttempts} attempts</p></div>
                <div className="flex gap-2">
                  <button type="button" className="btn-outline btn-sm" onClick={() => setOpenAssess({ a: as, view: 'questions' })}>Questions</button>
                  <button type="button" className="btn-outline btn-sm" onClick={() => setOpenAssess({ a: as, view: 'subs' })}>Submissions</button>
                  <button type="button" className="btn-ghost btn-sm text-red-700" onClick={async () => { if (window.confirm('Delete this assessment and all submissions?')) { await del(`/t/${slug}/assessments/${as.id}`); reload(); } }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </section>
          ))}
          <form className="panel grid gap-3 p-5 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); await post(`/t/${slug}/courses/${course.id}/assessments`, newAssess); setNewAssess({ ...newAssess, title: '' }); reload(); }}>
            <Input label="New assessment" name="atitle" required placeholder="e.g. Final check" value={newAssess.title} onChange={(e) => setNewAssess({ ...newAssess, title: e.target.value })} />
            <Input label="Pass mark %" name="pm" type="number" value={newAssess.passMark} onChange={(e) => setNewAssess({ ...newAssess, passMark: e.target.value })} />
            <Input label="Attempts" name="ma" type="number" value={newAssess.maxAttempts} onChange={(e) => setNewAssess({ ...newAssess, maxAttempts: e.target.value })} />
            <button type="submit" className="btn-primary">Add</button>
            <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" className="accent-emerald" checked={newAssess.isFinal} onChange={(e) => setNewAssess({ ...newAssess, isFinal: e.target.checked })} />Learners must pass this to complete the course and earn the certificate</label>
          </form>
        </div>
      )}

      {tab === 'details' && (
        <form onSubmit={saveMeta} className="panel max-w-3xl space-y-4 p-6">
          <Input label="Title" name="title" value={m.title} onChange={(e) => setMeta({ ...m, title: e.target.value })} />
          <Textarea label="Summary" name="summary" rows={2} value={m.summary || ''} onChange={(e) => setMeta({ ...m, summary: e.target.value })} />
          <Textarea label="Description" name="description" rows={6} value={m.description || ''} onChange={(e) => setMeta({ ...m, description: e.target.value })} hint="Markdown supported." />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Category" name="category" value={m.category || ''} onChange={(e) => setMeta({ ...m, category: e.target.value })} />
            <Select label="Level" name="level" value={m.level} onChange={(e) => setMeta({ ...m, level: e.target.value })} options={['beginner', 'intermediate', 'advanced']} />
            <Input label="Estimated hours" name="estimatedHours" type="number" step="0.5" value={m.estimatedHours} onChange={(e) => setMeta({ ...m, estimatedHours: e.target.value })} />
          </div>
          <div>
            <span className="label">Cover image</span>
            <div className="flex flex-wrap items-center gap-3">{m.coverUrl && <img src={m.coverUrl} alt="" className="h-16 w-28 rounded-lg object-cover" />}<UploadButton kind="image" label="Upload cover" onUploaded={(url) => setMeta({ ...m, coverUrl: url })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-emerald" checked={!!m.certificateEnabled} onChange={(e) => setMeta({ ...m, certificateEnabled: e.target.checked })} />Award a certificate on completion</label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={act.busy}>Save details</button>
            <button type="button" className="btn-danger" onClick={async () => { if (window.confirm('Delete this course? Courses with learners are archived instead.')) { await del(`/t/${slug}/courses/${course.id}`); window.location.href = `/app/a/${slug}/courses`; } }}>Delete course</button>
          </div>
        </form>
      )}

      {lessonModal && <LessonModal open onClose={() => setLessonModal(null)} moduleId={lessonModal.moduleId} lesson={lessonModal.lesson} onSaved={reload} />}
      <Modal open={!!openAssess} onClose={() => setOpenAssess(null)} title={openAssess?.a.title || ''} wide>
        {openAssess?.view === 'questions' && <QuestionEditor assessment={openAssess.a} />}
        {openAssess?.view === 'subs' && <Submissions assessment={openAssess.a} />}
      </Modal>
      {toastEl}
    </div>
  );
}
