import type { Metadata } from "next";
import LegalPageLayout from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy | Olera",
  description:
    "Olera Privacy Policy — learn how we collect, use, and protect your personal data.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy | Olera",
    description:
      "Olera Privacy Policy — learn how we collect, use, and protect your personal data.",
    url: "/privacy",
    siteName: "Olera",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | Olera",
    description:
      "Olera Privacy Policy — learn how we collect, use, and protect your personal data.",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="December 2, 2025">
        {/* ── Interpretation and Definitions ── */}
        <h2>Interpretation and Definitions</h2>

        <h3>Interpretation</h3>
        <p>
          Terms with initial capital letters have defined meanings under this
          policy. These definitions apply uniformly whether used in singular or
          plural form.
        </p>

        <h3>Definitions</h3>
        <p>For purposes of this Privacy Policy:</p>
        <ul>
          <li>
            <strong>Account:</strong> A unique account created for You to access
            our Service or parts of our Service.
          </li>
          <li>
            <strong>Company:</strong> &ldquo;Olera Inc., 1337 W 43rd St. Unit
            #1010, Houston, TX 77018&rdquo; (referred to as &ldquo;the
            Company&rdquo;, &ldquo;We&rdquo;, &ldquo;Us&rdquo; or
            &ldquo;Our&rdquo;).
          </li>
          <li>
            <strong>Cookies:</strong> Small files placed on Your computer,
            mobile device or any other device by a website, containing details of
            Your browsing history.
          </li>
          <li>
            <strong>Country:</strong> Texas, United States
          </li>
          <li>
            <strong>Device:</strong> Any device that can access the Service
            (computer, cellphone, digital tablet).
          </li>
          <li>
            <strong>Personal Data:</strong> Any information relating to an
            identified or identifiable individual.
          </li>
          <li>
            <strong>Service:</strong> The Website.
          </li>
          <li>
            <strong>Service Provider:</strong> Any natural or legal person who
            processes data on behalf of the Company, including third-party
            companies or individuals employed by the Company.
          </li>
          <li>
            <strong>Usage Data:</strong> Data collected automatically from the
            use of the Service or from Service infrastructure itself (e.g., page
            visit duration).
          </li>
          <li>
            <strong>Website:</strong> Olera, accessible from www.olera.care
          </li>
          <li>
            <strong>You:</strong> The individual accessing or using the Service,
            or the company or other legal entity on behalf of which such
            individual is accessing or using the Service.
          </li>
        </ul>

        {/* ── Collecting and Using Your Personal Data ── */}
        <h2>Collecting and Using Your Personal Data</h2>

        <h3>Types of Data Collected</h3>

        <h4>Personal Data</h4>
        <p>
          While using Our Service, We may ask You to provide personally
          identifiable information that can be used to contact or identify You.
          This may include, but is not limited to:
        </p>
        <ul>
          <li>Email address</li>
          <li>First name and last name</li>
          <li>Usage Data</li>
        </ul>

        <h4>Usage Data</h4>
        <p>
          Usage Data is collected automatically when using the Service.
        </p>
        <p>Usage Data may include:</p>
        <ul>
          <li>
            Your Device&apos;s Internet Protocol address (IP address)
          </li>
          <li>Browser type and version</li>
          <li>Pages of our Service that You visit</li>
          <li>Time and date of Your visit</li>
          <li>Time spent on those pages</li>
          <li>Unique device identifiers</li>
          <li>Other diagnostic data</li>
        </ul>
        <p>
          When You access the Service by or through a mobile device, We may
          collect certain information automatically, including:
        </p>
        <ul>
          <li>Type of mobile device You use</li>
          <li>Your mobile device unique ID</li>
          <li>IP address of Your mobile device</li>
          <li>Your mobile operating system</li>
          <li>Type of mobile Internet browser You use</li>
          <li>Unique device identifiers</li>
          <li>Other diagnostic data</li>
        </ul>
        <p>
          We may also collect information that Your browser sends whenever You
          visit our Service or when You access the Service by or through a mobile
          device.
        </p>

        <h3>Tracking Technologies and Cookies</h3>
        <p>
          We use Cookies and similar tracking technologies to track activity on
          Our Service and store certain information. Tracking technologies used
          include beacons, tags, and scripts to collect and track information and
          to improve and analyze Our Service.
        </p>

        <h4>Cookies or Browser Cookies</h4>
        <p>
          A cookie is a small file placed on Your Device. You can instruct Your
          browser to refuse all Cookies or to indicate when a Cookie is being
          sent. However, if You do not accept Cookies, You may not be able to use
          some parts of our Service. Unless you have adjusted Your browser
          setting to refuse Cookies, our Service may use Cookies.
        </p>

        <h4>Flash Cookies</h4>
        <p>
          Certain features of our Service may use local stored objects (Flash
          Cookies) to collect and store information about Your preferences or
          Your activity on our Service. Flash Cookies are not managed by the same
          browser settings as those used for Browser Cookies.
        </p>

        <h4>Web Beacons</h4>
        <p>
          Certain sections of our Service and our emails may contain small
          electronic files known as web beacons (also referred to as clear gifs,
          pixel tags, and single-pixel gifs) that permit the Company to count
          users who have visited those pages or opened an email and for other
          related website statistics.
        </p>

        <p>
          We use both Session and Persistent Cookies for the purposes set out
          below:
        </p>
        <ul>
          <li>
            <strong>Necessary / Essential Cookies:</strong> Session Cookies
            administered by Us to provide You with services available through the
            Website and to enable You to use some of its features. They help to
            authenticate users and prevent fraudulent use of user accounts.
          </li>
          <li>
            <strong>Cookies Policy / Notice Acceptance Cookies:</strong>{" "}
            Persistent Cookies administered by Us to identify if users have
            accepted the use of cookies on the Website.
          </li>
          <li>
            <strong>Functionality Cookies:</strong> Persistent Cookies
            administered by Us to allow us to remember choices You make when You
            use the Website, such as remembering your login details or language
            preference.
          </li>
        </ul>

        <h3>Use of Your Personal Data</h3>
        <p>
          The Company may use Personal Data for the following purposes:
        </p>
        <ul>
          <li>
            <strong>To provide and maintain our Service:</strong> Including to
            monitor the usage of our Service.
          </li>
          <li>
            <strong>To manage Your Account:</strong> To manage Your registration
            as a user of the Service.
          </li>
          <li>
            <strong>For the performance of a contract:</strong> The development,
            compliance and undertaking of the purchase contract for the products,
            items or services You have purchased or of any other contract with Us
            through the Service.
          </li>
          <li>
            <strong>To contact You:</strong> To contact You by email, telephone
            calls, SMS, or other equivalent forms of electronic communication
            regarding updates or informative communications related to the
            functionalities, products or contracted services.
          </li>
          <li>
            <strong>
              To provide You with news, special offers and general information
            </strong>{" "}
            about other goods, services and events which we offer that are
            similar to those that you have already purchased or enquired about
            unless You have opted not to receive such information.
          </li>
          <li>
            <strong>To manage Your requests:</strong> To attend and manage Your
            requests to Us.
          </li>
          <li>
            <strong>For business transfers:</strong> We may use Your information
            to evaluate or conduct a merger, divestiture, restructuring,
            reorganization, dissolution, or other sale or transfer of some or all
            of Our assets.
          </li>
          <li>
            <strong>For other purposes:</strong> We may use Your information for
            data analysis, identifying usage trends, determining the
            effectiveness of our promotional campaigns and to evaluate and
            improve our Service.
          </li>
        </ul>

        <h3>Sharing Your Personal Information</h3>
        <p>
          We may share Your personal information in the following situations:
        </p>
        <ul>
          <li>
            <strong>With Service Providers:</strong> To monitor and analyze the
            use of our Service, or to contact You.
          </li>
          <li>
            <strong>For business transfers:</strong> In connection with, or
            during negotiations of, any merger, sale of Company assets,
            financing, or acquisition.
          </li>
          <li>
            <strong>With Affiliates:</strong> We may share Your information with
            Our affiliates, who will honor this Privacy Policy.
          </li>
          <li>
            <strong>With business partners:</strong> To offer You certain
            products, services or promotions.
          </li>
          <li>
            <strong>With other users:</strong> When You share personal
            information or interact in public areas with other users.
          </li>
          <li>
            <strong>With Your consent:</strong> We may disclose Your personal
            information for any other purpose with Your consent.
          </li>
        </ul>

        <h3>Retention of Your Personal Data</h3>
        <p>
          The Company will retain Your Personal Data only for as long as is
          necessary for the purposes set out in this Privacy Policy. We will
          retain and use Your Personal Data to the extent necessary to comply
          with our legal obligations, resolve disputes, and enforce our legal
          agreements and policies.
        </p>

        <h3>Transfer of Your Personal Data</h3>
        <p>
          Your information, including Personal Data, is processed at the
          Company&apos;s operating offices and in any other places where the
          parties involved in the processing are located. Your consent to this
          Privacy Policy followed by Your submission of such information
          represents Your agreement to that transfer.
        </p>

        <h3>Disclosure of Your Personal Data</h3>

        <h4>Business Transactions</h4>
        <p>
          If the Company is involved in a merger, acquisition or asset sale, Your
          Personal Data may be transferred. We will provide notice before Your
          Personal Data is transferred and becomes subject to a different Privacy
          Policy.
        </p>

        <h4>Law Enforcement</h4>
        <p>
          Under certain circumstances, the Company may be required to disclose
          Your Personal Data if required to do so by law or in response to valid
          requests by public authorities.
        </p>

        <h4>Other Legal Requirements</h4>
        <p>
          The Company may disclose Your Personal Data in the good faith belief
          that such action is necessary to:
        </p>
        <ul>
          <li>Comply with a legal obligation</li>
          <li>
            Protect and defend the rights or property of the Company
          </li>
          <li>
            Prevent or investigate possible wrongdoing in connection with the
            Service
          </li>
          <li>
            Protect the personal safety of Users of the Service or the public
          </li>
          <li>Protect against legal liability</li>
        </ul>

        <h3>Security of Your Personal Data</h3>
        <p>
          The security of Your Personal Data is important to Us, but no method of
          transmission over the Internet or electronic storage is 100% secure.
          While We strive to use commercially acceptable means to protect Your
          Personal Data, We cannot guarantee its absolute security.
        </p>

        {/* ── SMS / Text Messaging ── */}
        <h2>SMS / Text Messaging</h2>
        <p>
          If You provide Your mobile phone number, You may receive text messages
          from Olera about Your care search, such as alerts when a provider
          responds to or reaches out about Your inquiry, care-benefit results You
          requested, and account verification codes. You agree to receive these
          messages by submitting Your number through our forms.
        </p>
        <p>
          <strong>Message frequency varies.</strong> Message and data rates may
          apply depending on Your mobile carrier and plan. Reply STOP to any
          message to opt out at any time, or reply HELP for help.
        </p>
        <p>
          <strong>
            We do not sell, rent, or share Your mobile phone number or Your SMS
            consent with any third parties or affiliates for their own marketing
            or promotional purposes.
          </strong>{" "}
          Mobile information is used solely to deliver the messages described
          above and is shared only with the service providers that help Us send
          them (for example, our SMS delivery vendor).
        </p>

        {/* ── Data Deletion Request Procedure ── */}
        <h2>Data Deletion Request Procedure</h2>
        <p>
          If you would like to request the deletion of your personal data from
          our systems, please follow the procedure outlined below:
        </p>
        <ol>
          <li>
            <strong>Submit a data deletion request</strong> by emailing our team
            at support@olera.care. Please include:
            <ul>
              <li>Your full name</li>
              <li>Your email address associated with your account</li>
              <li>
                A clear and specific description of the data you would like
                deleted
              </li>
            </ul>
          </li>
          <li>
            <strong>Identity verification:</strong> We may require additional
            information to verify your identity before processing your request.
          </li>
          <li>
            <strong>Processing your request:</strong> Once verified, we will
            process your data deletion request promptly. Processing time may vary
            depending on the complexity and volume of data involved.
          </li>
          <li>
            <strong>Notification and residual data:</strong> We will notify you
            via email once your data has been deleted. Some residual data may
            remain in backups or archives for a limited period, as permitted by
            applicable law.
          </li>
        </ol>
        <p>
          <strong>Important:</strong> Deleting your data may result in the loss
          of certain services or functionalities provided by Olera.
        </p>

        {/* ── Children's Privacy ── */}
        <h2>Children&apos;s Privacy</h2>
        <p>
          Our Service does not address anyone under the age of 13. We do not
          knowingly collect personally identifiable information from anyone under
          the age of 13. If You are a parent or guardian and You are aware that
          Your child has provided Us with Personal Data, please contact Us.
        </p>

        {/* ── Links to Other Websites ── */}
        <h2>Links to Other Websites</h2>
        <p>
          Our Service may contain links to other websites that are not operated
          by Us. We strongly advise You to review the Privacy Policy of every
          site You visit. We have no control over and assume no responsibility
          for the content, privacy policies or practices of any third party sites
          or services.
        </p>

        {/* ── Changes to this Privacy Policy ── */}
        <h2>Changes to this Privacy Policy</h2>
        <p>
          We may update Our Privacy Policy from time to time. We will notify You
          of any changes by posting the new Privacy Policy on this page. You are
          advised to review this Privacy Policy periodically for any changes.
        </p>

        {/* ── Contact Us ── */}
        <h2>Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, You can contact
          us:
        </p>
        <p>
          <strong>Olera, Inc.</strong>
          <br />
          1337 W 43rd St., Unit #1010
          <br />
          Houston, TX 77018
        </p>
        <p>
          <strong>Phone:</strong> +1 979-243-9801
        </p>
        <p>
          <strong>Email:</strong> support@olera.care
        </p>
    </LegalPageLayout>
  );
}
