// src/services/authService.js
import { auth } from '../firebase/config';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "firebase/auth";

export const signUp = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Successfully registered:", userCredential.user);
    return userCredential.user;
  } catch (error) {
    console.error("Error during registration:", error.message);
    // Here you could return the error message to display it in the UI
    return null;
  }
};

export const signIn = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Successfully signed in:", userCredential.user);
    return userCredential.user;
  } catch (error) {
    console.error("Error during sign-in:", error.message);
    return null;
  }
};