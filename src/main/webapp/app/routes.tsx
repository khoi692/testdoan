import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AUTHORITIES } from './config/constants';
import { useAppDispatch, useAppSelector } from './config/store';
import { getSession } from './shared/auth/auth.reducer';

// Lazy load components
const Home = React.lazy(() => import('./modules/home/home'));
const Login = React.lazy(() => import('./modules/account/login-page'));
const Register = React.lazy(() => import('./modules/account/register'));
const Activate = React.lazy(() => import('./modules/account/activate/activate'));
const ForgotPassword = React.lazy(() => import('./modules/account/forgot-password-page'));
const ContactUs = React.lazy(() => import('./modules/home/contact-us'));
const Dashboard = React.lazy(() => import('./modules/dashboard/dashboard'));
const VocabularyList = React.lazy(() => import('./modules/courses/vocabulary-list'));
const ReadingLesson = React.lazy(() => import('./modules/courses/reading-lesson'));
const BookImportPage = React.lazy(() => import('./modules/staff/book-import'));

const PrivateRoute = ({ hasAnyAuthorities = [], children }: { hasAnyAuthorities?: string[]; children: React.ReactElement }) => {
  const location = useLocation();
  const { isAuthenticated, account, sessionHasBeenFetched } = useAppSelector(state => state.authentication);
  const authorities = account?.authorities || [];
  const hasAuthority = hasAnyAuthorities.length === 0 || hasAnyAuthorities.some(authority => authorities.includes(authority));

  if (!sessionHasBeenFetched) {
    return <div className="loading-spinner">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasAuthority) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const dispatch = useAppDispatch();
  const sessionHasBeenFetched = useAppSelector(state => state.authentication.sessionHasBeenFetched);

  useEffect(() => {
    if (!sessionHasBeenFetched) {
      dispatch(getSession());
    }
  }, [dispatch, sessionHasBeenFetched]);

  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="activate" element={<Activate />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="contact" element={<ContactUs />} />

      {/* Dashboard Routes */}
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="dashboard/profile" element={<div style={{ padding: '24px' }}>Profile Page (Coming Soon)</div>} />
      <Route path="dashboard/vocabulary" element={<VocabularyList />} />
      <Route path="dashboard/lesson/:id" element={<ReadingLesson />} />
      <Route
        path="staff/book-import"
        element={
          <PrivateRoute hasAnyAuthorities={[AUTHORITIES.STAFF]}>
            <BookImportPage />
          </PrivateRoute>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
