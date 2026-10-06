/* eslint-disable react/no-unknown-property */
/**
 * Student Profile PDF Template
 *
 * A clean, professional one-page profile summary for sharing with providers
 * or for student records. Shows identity, education, experience, availability,
 * certifications, and screening responses.
 *
 * Uses Helvetica (built-in) to avoid network font fetches in serverless.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import type { StudentMetadata } from "@/lib/types";

// Colors from the Olera design system
const EMERALD = "#059669";
const EMERALD_DARK = "#047857";
const EMERALD_DEEP = "#064e3b";
const EMERALD_TINT = "#ecfdf5";
const GRAY_900 = "#111827";
const GRAY_700 = "#374151";
const GRAY_600 = "#4b5563";
const GRAY_500 = "#6b7280";
const GRAY_400 = "#9ca3af";
const GRAY_200 = "#e5e7eb";
const GRAY_100 = "#f3f4f6";
const GRAY_50 = "#f9fafb";
const WHITE = "#ffffff";

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: GRAY_700,
    lineHeight: 1.4,
  },
  body: { paddingHorizontal: 36 },

  // Header band
  band: {
    backgroundColor: EMERALD_DEEP,
    paddingHorizontal: 36,
    paddingTop: 20,
    paddingBottom: 18,
    marginBottom: 20,
  },
  bandTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: { width: 18, height: 18, marginRight: 6 },
  brandText: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    letterSpacing: 0.3,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  dateLabel: {
    fontSize: 7,
    color: "#6ee7b7",
    letterSpacing: 0.8,
  },
  dateValue: {
    fontSize: 8,
    color: WHITE,
    marginTop: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  photo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
    backgroundColor: "#10b981",
  },
  photoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  photoInitials: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
  },
  titleInfo: { flex: 1 },
  name: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 10,
    color: "#a7f3d0",
    marginTop: 3,
  },
  badges: {
    flexDirection: "row",
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#10b981",
    marginRight: 6,
  },
  badgeText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    letterSpacing: 0.5,
  },

  // Section styling
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: EMERALD_DARK,
    letterSpacing: 1.2,
  },
  sectionLine: {
    flex: 1,
    height: 0.75,
    backgroundColor: GRAY_200,
    marginLeft: 10,
  },

  // Two-column layout
  twoCol: {
    flexDirection: "row",
  },
  col: { flex: 1 },

  // Info grid
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  infoItem: {
    width: "50%",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 7,
    color: GRAY_500,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 9,
    color: GRAY_900,
  },
  infoValueMuted: {
    fontSize: 9,
    color: GRAY_400,
    fontStyle: "italic",
  },

  // Certification chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: EMERALD_TINT,
    marginRight: 4,
    marginBottom: 4,
  },
  chipText: {
    fontSize: 8,
    color: EMERALD_DARK,
    fontFamily: "Helvetica-Bold",
  },

  // Experience entries
  experienceEntry: {
    marginBottom: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: EMERALD,
  },
  experienceTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: GRAY_900,
  },
  experienceTag: {
    fontSize: 7,
    color: EMERALD_DARK,
    marginLeft: 6,
  },
  experienceDesc: {
    fontSize: 8,
    color: GRAY_600,
    marginTop: 2,
    lineHeight: 1.4,
  },
  experienceDate: {
    fontSize: 7,
    color: GRAY_500,
    marginTop: 2,
  },

  // Availability grid
  availGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  availDay: {
    width: "48%",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: GRAY_50,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  availDayName: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GRAY_700,
  },
  availTimes: {
    fontSize: 7,
    color: GRAY_600,
    marginTop: 1,
  },

  // Seasonal availability
  seasonGrid: {
    flexDirection: "row",
  },
  seasonBox: {
    flex: 1,
    padding: 6,
    borderRadius: 4,
    alignItems: "center",
    marginRight: 6,
  },
  seasonAvailable: {
    backgroundColor: EMERALD_TINT,
  },
  seasonLimited: {
    backgroundColor: "#fef3c7",
  },
  seasonUnavailable: {
    backgroundColor: GRAY_100,
  },
  seasonName: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: GRAY_700,
  },
  seasonStatus: {
    fontSize: 6,
    color: GRAY_600,
    marginTop: 1,
  },

  // Q&A section
  qa: {
    marginBottom: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: GRAY_200,
  },
  qaQuestion: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GRAY_700,
    marginBottom: 3,
  },
  qaAnswer: {
    fontSize: 8,
    color: GRAY_600,
    lineHeight: 1.45,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 0.75,
    borderTopColor: GRAY_200,
  },
  footerLeft: {
    fontSize: 7,
    color: GRAY_500,
  },
  footerRight: {
    fontSize: 7,
    color: GRAY_500,
  },

  // Why caregiving
  paragraph: {
    fontSize: 9,
    color: GRAY_700,
    lineHeight: 1.5,
  },

  // Pledges
  pledgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  pledge: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  pledgeIcon: {
    marginRight: 4,
  },
  pledgeCheck: {
    fontSize: 10,
    color: EMERALD,
  },
  pledgeX: {
    fontSize: 10,
    color: GRAY_400,
  },
  pledgeText: {
    fontSize: 8,
    color: GRAY_700,
  },
  pledgeTextMuted: {
    fontSize: 8,
    color: GRAY_400,
  },

  // Links
  link: {
    fontSize: 9,
    color: EMERALD_DARK,
    textDecoration: "underline",
  },
});

/**
 * Truncate a URL for display, keeping the domain and a hint of the path.
 */
function truncateUrl(url: string, maxLength = 50): string {
  if (!url || url.length <= maxLength) return url;
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    const pathHint = parsed.pathname.length > 15
      ? parsed.pathname.slice(0, 12) + "..."
      : parsed.pathname;
    return `${domain}${pathHint}`;
  } catch {
    // Not a valid URL, just truncate
    return url.slice(0, maxLength - 3) + "...";
  }
}

export interface StudentPdfData {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  metadata: StudentMetadata;
}

export interface StudentPdfAssets {
  logoDataUri?: string;
  photoDataUri?: string;
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatTime(time: string): string {
  if (!time || !time.includes(":")) return time || "";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return time;
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? "pm" : "am";
  return mStr === "00" ? `${hour}${ampm}` : `${hour}:${mStr}${ampm}`;
}

export function StudentPdfTemplate({
  student,
  assets,
}: {
  student: StudentPdfData;
  assets: StudentPdfAssets;
}) {
  const meta = student.metadata || {};
  const isApproved = !!meta.application_completed;
  const exportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build subtitle: University, Major
  const subtitleParts: string[] = [];
  if (meta.university) subtitleParts.push(meta.university);
  if (meta.major) subtitleParts.push(meta.major);
  const subtitle = subtitleParts.join(" · ") || "Student";

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header Band */}
        <View style={styles.band}>
          <View style={styles.bandTop}>
            <View style={styles.brandRow}>
              {assets.logoDataUri && (
                <Image src={assets.logoDataUri} style={styles.logo} />
              )}
              <Text style={styles.brandText}>Olera</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.dateLabel}>EXPORTED</Text>
              <Text style={styles.dateValue}>{exportDate}</Text>
            </View>
          </View>

          <View style={styles.titleRow}>
            {assets.photoDataUri ? (
              <Image src={assets.photoDataUri} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoInitials}>
                  {getInitials(student.display_name)}
                </Text>
              </View>
            )}
            <View style={styles.titleInfo}>
              <Text style={styles.name}>{student.display_name}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>STUDENT</Text>
                </View>
                {isApproved && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>APPROVED</Text>
                  </View>
                )}
                {student.is_active && isApproved && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>ACTIVE</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {/* Contact & Education */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>CONTACT & EDUCATION</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>EMAIL</Text>
                <Text style={student.email ? styles.infoValue : styles.infoValueMuted}>
                  {student.email || "Not provided"}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>PHONE</Text>
                <Text style={student.phone ? styles.infoValue : styles.infoValueMuted}>
                  {student.phone || "Not provided"}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>LOCATION</Text>
                <Text style={student.city || student.state ? styles.infoValue : styles.infoValueMuted}>
                  {[student.city, student.state].filter(Boolean).join(", ") || "Not provided"}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>UNIVERSITY</Text>
                <Text style={meta.university ? styles.infoValue : styles.infoValueMuted}>
                  {meta.university || "Not provided"}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>MAJOR</Text>
                <Text style={meta.major ? styles.infoValue : styles.infoValueMuted}>
                  {meta.major || "Not provided"}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>PROGRAM TRACK</Text>
                <Text style={meta.program_track ? styles.infoValue : styles.infoValueMuted}>
                  {meta.program_track || "Not specified"}
                </Text>
              </View>
              {meta.campus && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>CAMPUS</Text>
                  <Text style={styles.infoValue}>{meta.campus}</Text>
                </View>
              )}
              {meta.intended_professional_school && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>CAREER GOAL</Text>
                  <Text style={styles.infoValue}>
                    {meta.intended_professional_school.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Documents & Media Links */}
          {(meta.resume_url || meta.video_intro_url) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>DOCUMENTS & MEDIA</Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.infoGrid}>
                {meta.resume_url && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>RESUME</Text>
                    {meta.resume_url.startsWith("http") ? (
                      <Link src={meta.resume_url} style={styles.link}>
                        {truncateUrl(meta.resume_url)}
                      </Link>
                    ) : (
                      <Text style={styles.infoValueMuted}>Uploaded to portal</Text>
                    )}
                  </View>
                )}
                {meta.video_intro_url && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>VIDEO INTRO</Text>
                    <Link src={meta.video_intro_url} style={styles.link}>
                      {truncateUrl(meta.video_intro_url)}
                    </Link>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Certifications */}
          {meta.certifications && meta.certifications.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>CERTIFICATIONS</Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.chipRow}>
                {meta.certifications.map((cert, i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{cert}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Experience */}
          {meta.experience_entries && meta.experience_entries.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>EXPERIENCE</Text>
                <View style={styles.sectionLine} />
              </View>
              {meta.experience_entries.slice(0, 4).map((entry) => (
                <View key={entry.id} style={styles.experienceEntry}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.experienceTitle}>{entry.title}</Text>
                    {entry.tag && <Text style={styles.experienceTag}>{entry.tag}</Text>}
                  </View>
                  {entry.description && (
                    <Text style={styles.experienceDesc}>{entry.description}</Text>
                  )}
                  <Text style={styles.experienceDate}>
                    {entry.start_date} – {entry.end_date || "Present"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Why Caregiving */}
          {meta.why_caregiving && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>WHY CAREGIVING</Text>
                <View style={styles.sectionLine} />
              </View>
              <Text style={styles.paragraph}>{meta.why_caregiving}</Text>
            </View>
          )}

          {/* Availability - Two columns */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AVAILABILITY</Text>
              <View style={styles.sectionLine} />
            </View>

            {/* Seasonal */}
            {meta.year_round_availability && (
              <View style={{ marginBottom: 10 }}>
                <View style={styles.seasonGrid}>
                  {(["spring", "summer", "fall", "winter"] as const).map((season) => {
                    const data = meta.year_round_availability?.[season];
                    const status = data?.status || "unavailable";
                    const boxStyle = [
                      styles.seasonBox,
                      status === "available"
                        ? styles.seasonAvailable
                        : status === "limited"
                          ? styles.seasonLimited
                          : styles.seasonUnavailable,
                    ];
                    return (
                      <View key={season} style={boxStyle}>
                        <Text style={styles.seasonName}>{capitalize(season)}</Text>
                        <Text style={styles.seasonStatus}>{capitalize(status)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Weekly schedule */}
            {meta.availability_schedule && Object.keys(meta.availability_schedule).length > 0 && (
              <View style={styles.availGrid}>
                {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((day) => {
                  const slots = meta.availability_schedule?.[day] || [];
                  if (slots.length === 0) return null;
                  const fullDay = {
                    Mon: "Monday",
                    Tue: "Tuesday",
                    Wed: "Wednesday",
                    Thu: "Thursday",
                    Fri: "Friday",
                    Sat: "Saturday",
                    Sun: "Sunday",
                  }[day];
                  const timeStr = slots
                    .map((slot) =>
                      typeof slot === "string"
                        ? slot
                        : `${formatTime(slot.start)}–${formatTime(slot.end)}`
                    )
                    .join(", ");
                  return (
                    <View key={day} style={styles.availDay}>
                      <Text style={styles.availDayName}>{fullDay}</Text>
                      <Text style={styles.availTimes}>{timeStr}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Commitment statement */}
            {meta.commitment_statement && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.infoLabel}>COMMITMENT STATEMENT</Text>
                <Text style={styles.paragraph}>{meta.commitment_statement}</Text>
              </View>
            )}

            {/* Availability notes */}
            {meta.availability_notes && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.infoLabel}>NOTES</Text>
                <Text style={{ fontSize: 8, color: GRAY_600 }}>{meta.availability_notes}</Text>
              </View>
            )}
          </View>

          {/* Commitments */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>COMMITMENTS</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.pledgeRow}>
              <View style={styles.pledge}>
                <Text style={[meta.advance_notice_pledge ? styles.pledgeCheck : styles.pledgeX, styles.pledgeIcon]}>
                  {meta.advance_notice_pledge ? "✓" : "○"}
                </Text>
                <Text style={meta.advance_notice_pledge ? styles.pledgeText : styles.pledgeTextMuted}>
                  Advance Notice
                </Text>
              </View>
              <View style={styles.pledge}>
                <Text style={[meta.ncns_pledge ? styles.pledgeCheck : styles.pledgeX, styles.pledgeIcon]}>
                  {meta.ncns_pledge ? "✓" : "○"}
                </Text>
                <Text style={meta.ncns_pledge ? styles.pledgeText : styles.pledgeTextMuted}>
                  No Call/No Show
                </Text>
              </View>
              <View style={styles.pledge}>
                <Text style={[meta.school_balance_pledge ? styles.pledgeCheck : styles.pledgeX, styles.pledgeIcon]}>
                  {meta.school_balance_pledge ? "✓" : "○"}
                </Text>
                <Text style={meta.school_balance_pledge ? styles.pledgeText : styles.pledgeTextMuted}>
                  School Balance
                </Text>
              </View>
              <View style={styles.pledge}>
                <Text style={[meta.prn_willing ? styles.pledgeCheck : styles.pledgeX, styles.pledgeIcon]}>
                  {meta.prn_willing ? "✓" : "○"}
                </Text>
                <Text style={meta.prn_willing ? styles.pledgeText : styles.pledgeTextMuted}>
                  PRN Available
                </Text>
              </View>
            </View>
          </View>

          {/* Screening Responses */}
          {meta.scenario_responses && meta.scenario_responses.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>SCREENING RESPONSES</Text>
                <View style={styles.sectionLine} />
              </View>
              {meta.scenario_responses.slice(0, 3).map((resp, i) => (
                <View key={i} style={styles.qa}>
                  <Text style={styles.qaQuestion}>{resp.question}</Text>
                  <Text style={styles.qaAnswer}>
                    {resp.answer || "No answer provided"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>
            Profile ID: {student.id.slice(0, 8)}
          </Text>
          <Text style={styles.footerRight}>
            Generated by Olera · olera.care
          </Text>
        </View>
      </Page>
    </Document>
  );
}
