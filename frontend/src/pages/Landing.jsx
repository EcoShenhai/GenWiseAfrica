import { Link } from 'react-router-dom';
import { BookOpen, Mic2, Video, HeartHandshake, Flame, Award, Sparkles, MapPin } from 'lucide-react';
import { useApi, useTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { TYPE_LABEL } from '../lib/format';

const PILLARS = [
  { icon: BookOpen, title: 'Courses', text: 'Build discipleship and leadership courses from video, audio, readings and PDFs. Learners pick up where they left off on any phone.' },
  { icon: Video, title: 'Live classes and meetings', text: 'Teach live, host fellowship nights and run webinars in rooms that open right inside your academy. Reminders go out by email.' },
  { icon: Mic2, title: 'Podcasts', text: 'Publish sermons, teachings and conversations as podcast shows, with show notes, Scripture references and an RSS feed.' },
  { icon: HeartHandshake, title: 'Mentorship', text: 'Mentees request a mentor, agree goals together and book private sessions. Mentors keep notes that only they can read.' },
  { icon: Flame, title: 'Prayer groups', text: 'Share requests openly, with leaders only, or anonymously. Pray for one another and celebrate answered prayer with praise reports.' },
  { icon: Award, title: 'Assessments and certificates', text: 'Quizzes grade themselves; essays go to the instructor. Finishing a course earns a certificate anyone can verify by QR code.' },
];

const STEPS = [
  { title: 'Open your academy', text: 'Tell us about your church, ministry or mentoring work. We review every academy so the community stays trustworthy.' },
  { title: 'Invite your people', text: 'Share your academy link. Members join with an email code, so there are no passwords to forget at the door.' },
  { title: 'Teach, gather and mentor', text: 'Publish a course, schedule a live class, start a prayer group and pair mentors with mentees.' },
  { title: 'Raise the next generation', text: 'Learners finish courses, earn certificates and begin to mentor others in turn.' },
];

const FAQ = [
  { q: 'Is GenWise Africa free?', a: 'Yes. Every academy is free while we launch. If your church or ministry would like to support the mission, you can give any amount by M-Pesa from your academy’s billing page.' },
  { q: 'Which churches and denominations can join?', a: 'Any Christ-centred church, ministry or independent mentor. Each academy sets its own teaching and leadership; GenWise provides the tools.' },
  { q: 'How do live classes work?', a: 'You schedule a class, members RSVP, and at the start time everyone joins a video room inside the academy from a phone or computer. You can also paste a Zoom or Google Meet link instead.' },
  { q: 'How is AI used?', a: 'Every lesson has an AI Study Guide that can summarise, explain, quiz and suggest Scripture. It works from the lesson your instructor wrote and always points learners back to their mentors for pastoral questions.' },
  { q: 'Is our information private?', a: 'Each academy’s members, prayer requests and mentorship notes are visible only inside that academy, and only to the people they are meant for.' },
];

function Rings() {
  const sizes = [260, 380, 520, 680, 860];
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
      {sizes.map((s, i) => <span key={s} className="growth-ring" style={{ width: s, height: s, left: -s / 2, top: -s / 2, animationDelay: `${0.15 + i * 0.18}s`, '--o': 1 - i * 0.17 }} />)}
    </div>
  );
}

export default function Landing() {
  useTitle();
  const { user } = useAuth();
  const { data: academies } = useApi('/public/academies');
  const { data: cfg } = useApi('/public/config');
  const featured = (academies || []).slice(0, 6);

  return (
    <>
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-night text-dawn">
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 50% 42%, rgba(201,163,78,.16), transparent 70%)' }} />
        <div className="relative mx-auto flex min-h-[94vh] max-w-4xl flex-col items-center justify-center px-4 pb-20 pt-32 text-center sm:px-6">
          <div className="relative">
            <Rings />
            <img src="/brand/logo-512.png" alt="GenWise Africa tree of wisdom logo" width="168" height="168" className="rise relative h-36 w-36 rounded-full shadow-[0_0_60px_rgba(201,163,78,.25)] sm:h-44 sm:w-44" />
          </div>
          <h1 className="rise mt-10 font-display text-[3.2rem] font-semibold leading-[0.95] text-gold-light sm:text-[5.5rem]" style={{ animationDelay: '.35s' }}>Generation of Wisdom</h1>
          <p className="rise mt-5 font-display text-2xl italic text-dawn/90 sm:text-3xl" style={{ animationDelay: '.5s' }}>Think Wise. Live Wise. Lead Generations.</p>
          <p className="rise mt-6 max-w-xl text-base text-dawn/70 sm:text-lg" style={{ animationDelay: '.65s' }}>
            A mentorship and learning home where churches, ministries and mentors run their own academies and raise wise, Christ-centred leaders across Africa.
          </p>
          <div className="rise mt-10 flex flex-wrap justify-center gap-3" style={{ animationDelay: '.8s' }}>
            <Link to={user ? '/app' : '/academies'} className="btn-gold px-7 py-3 text-[15px]">Begin learning</Link>
            <Link to="/start-academy" className="btn-ghost-light px-7 py-3 text-[15px]">Start your academy</Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- pillars */}
      <section id="features" className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="font-display text-5xl font-semibold leading-tight text-night">Everything your discipleship ministry does, in one academy</h2>
            <p className="mt-5 max-w-md text-lg text-ink-muted">Teaching, gathering, mentoring and praying belong together. Each academy brings them under one roof with your name on the door.</p>
            <Link to="/start-academy" className="btn-primary mt-8">Start your academy</Link>
          </div>
          <dl className="divide-y divide-dawn-200 border-y border-dawn-200">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="grid grid-cols-[2.5rem_1fr] gap-4 py-7">
                <Icon className="mt-1 h-6 w-6 text-gold-deep" aria-hidden />
                <div>
                  <dt className="font-display text-[1.7rem] font-semibold leading-tight text-night">{title}</dt>
                  <dd className="mt-1.5 text-ink-muted">{text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------- AI + human */}
      <section className="bg-dawn">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-5xl font-semibold leading-tight text-night">Taught by mentors, supported by a study guide that never sleeps</h2>
            <p className="mt-5 text-lg text-ink-muted">Your instructors write the lessons and lead the classes. Between sessions, every learner has an AI Study Guide beside each lesson that can summarise, explain in plain words, quiz them and suggest related Scripture.</p>
            <p className="mt-4 text-ink-muted">It answers from your lesson, not the open internet, and sends pastoral questions back to people who can pray with them.</p>
          </div>
          <figure className="panel overflow-hidden shadow-[0_24px_60px_-30px_rgba(14,6,55,.35)]" aria-label="Example of the AI Study Guide beside a lesson">
            <div className="border-b border-dawn-200 px-6 py-4">
              <p className="text-xs text-ink-muted">Foundations of Wisdom, lesson 1</p>
              <p className="font-display text-2xl font-semibold text-night">Wisdom begins with God</p>
            </div>
            <div className="space-y-4 px-6 py-5 text-[15px]">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-night px-4 py-2.5 text-dawn">How does this apply to my life this week?</div>
              <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-dawn px-4 py-3 text-ink">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald"><Sparkles className="h-3.5 w-3.5" />Study Guide</p>
                <p>Three small steps for this week:</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li>Before a big decision, pause and pray James 1:5.</li>
                  <li>Ask one older believer how they learned to choose wisely.</li>
                  <li>Journal: where did fear of people guide you more than fear of the LORD?</li>
                </ul>
              </div>
            </div>
          </figure>
        </div>
      </section>

      {/* ---------------------------------------------------------- how it works (true sequence) */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2 className="max-w-2xl font-display text-5xl font-semibold leading-tight text-night">From a first meeting to a mentoring movement</h2>
          <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative border-t-2 border-gold pt-6">
                <span className="font-display text-6xl font-semibold leading-none text-gold/70">{i + 1}</span>
                <h3 className="mt-3 font-display text-2xl font-semibold text-night">{s.title}</h3>
                <p className="mt-2 text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------- for churches / learners */}
      <section id="churches" className="bg-night text-dawn">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 py-24 sm:px-6 md:grid-cols-2">
          <div className="md:pr-12">
            <h2 className="font-display text-4xl font-semibold text-gold-light">For churches, ministries and mentors</h2>
            <ul className="mt-6 space-y-3 text-dawn/80">
              <li>Your own academy page, logo and colours at genwiseafrica.org</li>
              <li>Roles for owners, admins, instructors, mentors and prayer leaders</li>
              <li>Approve who joins, or open your doors to everyone</li>
              <li>See enrolments, completions and active mentorships at a glance</li>
            </ul>
          </div>
          <div className="mt-12 border-t border-gold/25 pt-12 md:mt-0 md:border-l md:border-t-0 md:pl-12 md:pt-0">
            <h2 className="font-display text-4xl font-semibold text-gold-light">For learners and mentees</h2>
            <ul className="mt-6 space-y-3 text-dawn/80">
              <li>Works on the phone in your pocket, no app to install</li>
              <li>Belong to more than one academy with a single account</li>
              <li>Find a mentor who has walked the road before you</li>
              <li>Earn certificates you can share and anyone can verify</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- scripture */}
      <section className="bg-dawn">
        <blockquote className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <p className="font-display text-4xl font-medium italic leading-snug text-night sm:text-5xl">“What you have heard from me in the presence of many witnesses entrust to faithful people, who will be able to teach others also.”</p>
          <footer className="mt-6 text-ink-muted">2 Timothy 2:2</footer>
        </blockquote>
      </section>

      {/* ---------------------------------------------------------- academies */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-5xl font-semibold text-night">Academies teaching now</h2>
            <Link to="/academies" className="link text-sm">See all academies</Link>
          </div>
          <ul className="mt-10 grid gap-x-10 gap-y-2 md:grid-cols-2">
            {featured.map((a) => (
              <li key={a.id}>
                <Link to={`/a/${a.slug}`} className="group flex items-center gap-4 border-b border-dawn-200 py-5">
                  {a.logoUrl ? <img src={a.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-night font-display text-2xl font-bold text-gold">{a.name[0]}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-2xl font-semibold text-night group-hover:text-emerald">{a.name}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                      <span>{TYPE_LABEL[a.type] || a.type}</span>
                      {(a.city || a.country) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[a.city, a.country].filter(Boolean).join(', ')}</span>}
                      <span>{a.courseCount} {a.courseCount === 1 ? 'course' : 'courses'}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {!featured.length && <li className="text-ink-muted">The first academies are opening now.</li>}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------- pricing */}
      <section id="pricing" className="bg-dawn">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="font-display text-5xl font-semibold leading-tight text-night">Free for every academy while we launch</h2>
            <p className="mt-5 max-w-xl text-lg text-ink-muted">Courses, live classes, podcasts, mentorship, prayer groups, the AI Study Guide and certificates are all included, for as many members as you have.</p>
            <Link to="/start-academy" className="btn-primary mt-8">Start your academy free</Link>
          </div>
          <div className="panel border-gold/40 p-7">
            <h3 className="font-display text-3xl font-semibold text-night">Support the mission</h3>
            <p className="mt-2 text-ink-muted">If your church or ministry would like to help GenWise grow, you can give any amount by M-Pesa.</p>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-dawn-200 pb-2"><dt className="text-ink-muted">Send money to</dt><dd className="font-display text-2xl font-semibold text-night">{cfg?.mpesa?.display || '0702 122 874'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-muted">Then</dt><dd className="text-right text-night">Enter the M-Pesa code in your academy’s billing page and we will confirm it</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- faq */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <h2 className="font-display text-5xl font-semibold text-night">Questions people ask</h2>
          <div className="mt-10 divide-y divide-dawn-200 border-y border-dawn-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-2xl font-semibold text-night">
                  {f.q}<span className="text-gold transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- closing */}
      <section className="relative overflow-hidden bg-night-800 text-center text-dawn">
        <div className="relative mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <h2 className="font-display text-5xl font-semibold text-gold-light">The next generation is waiting to be mentored</h2>
          <p className="mx-auto mt-5 max-w-xl text-dawn/75">Open your academy today. It takes a few minutes, and it is free.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/start-academy" className="btn-gold px-7 py-3">Start your academy</Link>
            <Link to="/register" className="btn-ghost-light px-7 py-3">Create a learner account</Link>
          </div>
        </div>
      </section>
    </>
  );
}
