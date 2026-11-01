import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { PublicLayout, AppLayout, RequireAuth } from './components/layouts';
import Landing from './pages/Landing';
import { Academies, AcademyPublic, StartAcademy, VerifyCertificate } from './pages/PublicPages';
import { Register, Login, VerifyCode, ForgotPassword, ResetPassword } from './pages/auth/AuthPages';
import { Home, Certificates, Profile } from './pages/app/MePages';
import { AcademyLayout } from './pages/academy/AcademyContext';
import Overview from './pages/academy/Overview';
import { CourseList, CourseDetail, LessonPlayer, AssessmentPage } from './pages/academy/Courses';
import Studio from './pages/academy/Studio';
import { MeetingList, MeetingDetail } from './pages/academy/Meetings';
import { PodcastList, PodcastShow } from './pages/academy/Podcasts';
import { Mentorship, MentorshipDetail, Prayer } from './pages/academy/Community';
import Manage from './pages/academy/Manage';
import Admin from './pages/admin/Admin';

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-6xl font-semibold text-night">Page not found</h1>
      <p className="mt-3 text-ink-muted">The page you were looking for has moved or never existed.</p>
      <Link to="/" className="btn-primary mt-8">Go to the home page</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="academies" element={<Academies />} />
        <Route path="a/:slug" element={<AcademyPublic />} />
        <Route path="start-academy" element={<StartAcademy />} />
        <Route path="verify" element={<VerifyCertificate />} />
        <Route path="verify/:serial" element={<VerifyCertificate />} />
      </Route>
      <Route path="register" element={<Register />} />
      <Route path="login" element={<Login />} />
      <Route path="verify-code" element={<VerifyCode />} />
      <Route path="verify-email" element={<VerifyCode />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="app" element={<Home />} />
        <Route path="app/certificates" element={<Certificates />} />
        <Route path="app/profile" element={<Profile />} />
        <Route path="app/a/:slug" element={<AcademyLayout />}>
          <Route index element={<Overview />} />
          <Route path="courses" element={<CourseList />} />
          <Route path="courses/:courseId" element={<CourseDetail />} />
          <Route path="learn/:lessonId" element={<LessonPlayer />} />
          <Route path="assessments/:assessmentId" element={<AssessmentPage />} />
          <Route path="studio/:courseId" element={<Studio />} />
          <Route path="meetings" element={<MeetingList />} />
          <Route path="meetings/:meetingId" element={<MeetingDetail />} />
          <Route path="podcasts" element={<PodcastList />} />
          <Route path="podcasts/:showId" element={<PodcastShow />} />
          <Route path="mentorship" element={<Mentorship />} />
          <Route path="mentorship/:mentorshipId" element={<MentorshipDetail />} />
          <Route path="prayer" element={<Prayer />} />
          <Route path="manage" element={<Manage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Route>
        <Route path="admin/*" element={<RequireAuth superAdmin><Admin /></RequireAuth>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
