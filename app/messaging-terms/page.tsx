import type { Metadata } from "next";
import LegalPageLayout from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "SMS / Text Messaging Terms | Olera",
  description:
    "How Olera's SMS program works: what messages you may receive, how you opt in, message frequency and rates, and how to opt out (reply STOP) or get help (reply HELP).",
  alternates: { canonical: "/messaging-terms" },
  openGraph: {
    title: "SMS / Text Messaging Terms | Olera",
    description:
      "How Olera's SMS program works: what messages you may receive, how you opt in, message frequency and rates, and how to opt out or get help.",
    url: "/messaging-terms",
    siteName: "Olera",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SMS / Text Messaging Terms | Olera",
    description:
      "How Olera's SMS program works: what messages you may receive, how you opt in, message frequency and rates, and how to opt out or get help.",
  },
};

export default function MessagingTermsPage() {
  return (
    <LegalPageLayout title="SMS / Text Messaging Terms" lastUpdated="July 2, 2026">
      {/* ── Overview ── */}
      <h2>Overview</h2>
      <p>
        This page describes the SMS (text message) program operated by Olera Inc.
        (&ldquo;Olera,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;), 1337 W 43rd St.
        Unit #1010, Houston, TX 77018. Olera helps families find and connect with
        senior-care providers. If you give us your mobile number through one of our
        forms, we may text you to support the care search you started with us.
        Participation is optional and always free to cancel.
      </p>

      {/* ── Messages You May Receive ── */}
      <h2>Messages You May Receive</h2>
      <p>These are the only kinds of messages we send:</p>
      <ul>
        <li>
          <strong>Care inquiry updates:</strong> alerts when a provider replies
          to or reaches out about a care inquiry you submitted.
        </li>
        <li>
          <strong>Care-benefit results:</strong> the personalized results you
          asked us to send after completing a benefits or care-matching form.
        </li>
        <li>
          <strong>Account and verification:</strong> one-time verification codes
          and account-related notices (for example, confirming a claim of a
          provider listing).
        </li>
      </ul>
      <p>
        We do not send marketing or promotional text blasts, and we do not text
        you about anything unrelated to the care search you started.
      </p>

      {/* ── How You Opt In ── */}
      <h2>How You Opt In</h2>
      <p>
        Text messages are never sent unless you ask for them. You opt in by
        entering your mobile phone number into a form on{" "}
        <a href="https://olera.care">olera.care</a>, for example when you send a
        care inquiry to a provider, request your care-benefit results, or verify
        your account. The phone field is always optional; if you leave it blank,
        you will not receive any texts.
      </p>
      <p>
        At the point where you enter your number, we display the following consent
        language directly next to the phone field:
      </p>
      <blockquote>
        If you add your phone, you agree to receive text messages from Olera about
        your care search (such as provider replies and updates). Msg &amp; data
        rates may apply. Message frequency varies. Reply STOP to opt out, HELP for
        help. See our <a href="/terms">Terms</a> and{" "}
        <a href="/privacy">Privacy Policy</a>.
      </blockquote>
      <p>
        Submitting the form with a phone number entered is your consent to receive
        the messages described above. Consent to receive texts is not a condition
        of using Olera or of any purchase.
      </p>

      {/* ── Message Frequency and Cost ── */}
      <h2>Message Frequency and Cost</h2>
      <p>
        <strong>Message frequency varies</strong> and depends on your activity,
        such as how many providers respond to your inquiry. Message and data
        rates may apply depending on your mobile carrier and plan.
      </p>

      {/* ── How to Opt Out or Get Help ── */}
      <h2>How to Opt Out or Get Help</h2>
      <p>
        You can cancel at any time. Reply <strong>STOP</strong> to any message to
        stop receiving texts from Olera; you will receive a single confirmation and
        then no further messages. Reply <strong>HELP</strong> to any message for
        help, or email us at{" "}
        <a href="mailto:support@olera.care">support@olera.care</a>.
      </p>

      {/* ── Privacy ── */}
      <h2>Privacy</h2>
      <p>
        <strong>
          We do not sell, rent, or share your mobile phone number or your SMS
          consent with any third parties or affiliates for their own marketing or
          promotional purposes.
        </strong>{" "}
        Your mobile information is used solely to deliver the messages described
        above and is shared only with the service providers that help us send them
        (for example, our SMS delivery vendor). For full details, see our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      {/* ── Contact ── */}
      <h2>Contact Us</h2>
      <p>
        Questions about our messaging program? Email{" "}
        <a href="mailto:support@olera.care">support@olera.care</a> or write to
        Olera Inc., 1337 W 43rd St. Unit #1010, Houston, TX 77018.
      </p>
    </LegalPageLayout>
  );
}
