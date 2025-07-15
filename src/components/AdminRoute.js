// src/components/AdminRoute.js
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

function AdminRoute({ children }) {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    // Wenn der User kein Admin ist, leite ihn zur Startseite um.
    return <Navigate to="/" />;
  }

  return children; // Wenn er Admin ist, zeige die gewünschte Seite an.
}

export default AdminRoute;