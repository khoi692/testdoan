import React from 'react';
import { Routes, Route } from 'react-router-dom';

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

const AppRoutes = () => {
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
    </Routes>
  );
};

export default AppRoutes;
