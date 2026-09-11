"use client";

import { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

interface StudentContextGateProps {
  /** Whether the URL has ?ctx=medjobs-student */
  isStudentContextFromUrl: boolean;
  /** Content to show for student users */
  studentContent: ReactNode;
  /** Content to show for non-student users */
  familyContent: ReactNode;
}

/**
 * Client component that decides whether to show student or family content.
 * Checks both URL parameter AND user's profile type to ensure students
 * always see the correct content, even if they navigate directly to the page.
 */
export function StudentContextGate({
  isStudentContextFromUrl,
  studentContent,
  familyContent,
}: StudentContextGateProps) {
  const { profiles, isLoading } = useAuth();

  // Check if user has a student profile
  const hasStudentProfile = profiles?.some((p) => p.type === "student");

  // Show student content if URL param is set OR if user has a student profile
  const showStudentContent = isStudentContextFromUrl || hasStudentProfile;

  // While loading auth, use URL param as the source of truth
  if (isLoading) {
    return <>{isStudentContextFromUrl ? studentContent : familyContent}</>;
  }

  return <>{showStudentContent ? studentContent : familyContent}</>;
}

/**
 * Component that only renders its children if the user is NOT a student.
 * Used for family-only features like lead capture.
 */
export function FamilyOnlyContent({
  isStudentContextFromUrl,
  children,
}: {
  isStudentContextFromUrl: boolean;
  children: ReactNode;
}) {
  const { profiles, isLoading } = useAuth();

  const hasStudentProfile = profiles?.some((p) => p.type === "student");
  const isStudent = isStudentContextFromUrl || hasStudentProfile;

  // While loading, use URL param
  if (isLoading) {
    return isStudentContextFromUrl ? null : <>{children}</>;
  }

  // Don't render for students
  if (isStudent) {
    return null;
  }

  return <>{children}</>;
}
