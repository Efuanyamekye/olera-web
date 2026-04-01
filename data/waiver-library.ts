export interface WaiverForm {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface ApplicationStep {
  step: number;
  title: string;
  description: string;
}

export interface ServiceArea {
  name: string;
  description: string;
}

export interface AlsoServing {
  text: string;
}

export interface MapPin {
  label: string;
  lat: number;
  lng: number;
}

export interface WaiverProgram {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  savingsRange: string;
  description: string;
  eligibilityHighlights: string[];
  applicationSteps: ApplicationStep[];
  forms: WaiverForm[];
  serviceAreas?: ServiceArea[];
  serviceAreasHeading?: string;
  serviceAreasSummary?: string;
  serviceAreasAlsoServing?: string;
  serviceAreasCta?: string;
  alsoServing?: string;
  mapPins?: MapPin[];
  phone?: string;
  intro?: string;
  faqs?: { question: string; answer: string }[];
}

export interface StateData {
  id: string;
  name: string;
  abbreviation: string;
  description: string;
  programs: WaiverProgram[];
}

// ─── Alabama ─────────────────────────────────────────────────────────────────────

const alabamaPrograms: WaiverProgram[] = [
  {
    id: "alabama-medicaid-for-aged-disabled",
    name: "Alabama Medicaid for Aged/Disabled",
    shortName: "ABD Medicaid",
    tagline: "State Medicaid program providing health care coverage for seniors 65+ and disabled individuals, covering doctor visits, hospital stays,...",
    savingsRange: "$5,000 – $20,000/year",
    description: "State Medicaid program providing health care coverage for seniors 65+ and disabled individuals, covering doctor visits, hospital stays, prescriptions, and long-term care services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $987/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alabama-medicaid-application", name: "Alabama Medicaid Application", description: "Official Alabama Medicaid application. Apply online or download a printable form.", url: "https://www.medicaid.alabama.gov/content/4.0_programs/4.2_apply.aspx" },
    ],
  },
  {
    id: "elderly-and-disabled-e-d-medicaid-waiver",
    name: "Elderly and Disabled (E&D) Medicaid Waiver",
    shortName: "E&D",
    tagline: "Home and community-based services waiver providing personal care, homemaker services, adult day health, respite care, and case management to help...",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services waiver providing personal care, homemaker services, adult day health, respite care, and case management to help seniors stay at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alabama-medicaid-application", name: "Alabama Medicaid Application", description: "Official Alabama Medicaid application, required for waiver enrollment.", url: "https://www.medicaid.alabama.gov/content/4.0_programs/4.2_apply.aspx" },
      { id: "alabama-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.medicaid.alabama.gov/content/4.0_programs/4.2_apply.aspx" },
    ],
  },
  {
    id: "home-delivered-meals-e-d-waiver-component",
    name: "Home-Delivered Meals (E&D Waiver Component)",
    shortName: "Home Meals",
    tagline: "Home-delivered frozen meals provided through the Elderly and Disabled Medicaid Waiver to help homebound seniors maintain nutrition and independence.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home-delivered frozen meals provided through the Elderly and Disabled Medicaid Waiver to help homebound seniors maintain nutrition and independence.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alabama-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Alaska ──────────────────────────────────────────────────────────────────────

const alaskaPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-disabled",
    name: "Medicaid for Aged/Disabled",
    shortName: "ABD Medicaid",
    tagline: "Alaska's Medicaid program for seniors aged 65+ who are aged, blind, or disabled, providing comprehensive health coverage and long-term care services.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Alaska's Medicaid program for seniors aged 65+ who are aged, blind, or disabled, providing comprehensive health coverage and long-term care services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3071/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-medicaid-application", name: "Alaska Medicaid Application", description: "Official Alaska Medicaid application. Apply online or download a printable form.", url: "https://health.alaska.gov/dpa/Pages/medicaid/default.aspx" },
    ],
  },
  {
    id: "alaskans-living-independently-waiver-ali",
    name: "Alaskans Living Independently Waiver (ALI)",
    shortName: "ALI",
    tagline: "Medicaid HCBS waiver providing home and community-based services to seniors 65+ including personal care, chore services, respite care, and care...",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing home and community-based services to seniors 65+ including personal care, chore services, respite care, and care coordination.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3071/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-medicaid-application", name: "Alaska Medicaid Application", description: "Official Alaska Medicaid application, required for waiver enrollment.", url: "https://health.alaska.gov/dpa/Pages/medicaid/default.aspx" },
      { id: "alaska-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://health.alaska.gov/dpa/Pages/medicaid/default.aspx" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Alaska's Medicare Savings Programs help low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Alaska's Medicare Savings Programs help low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1500/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://health.alaska.gov/dpa/Pages/medicaid/default.aspx" },
    ],
  },
  {
    id: "alaska-snap-food-stamps",
    name: "Alaska SNAP (Food Stamps)",
    shortName: "SNAP/Food",
    tagline: "Alaska's SNAP program provides monthly benefits via EBT card to help low-income seniors purchase nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Alaska's SNAP program provides monthly benefits via EBT card to help low-income seniors purchase nutritious food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-snap-application", name: "Alaska SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://health.alaska.gov/dpa/Pages/fstamps/default.aspx" },
    ],
  },
  {
    id: "alaska-senior-medicare-advisory-network",
    name: "Alaska Senior Medicare Advisory Network",
    shortName: "Alaska Senior Medicare",
    tagline: "Free, unbiased counseling on Medicare options, enrollment periods, and benefits for Alaska seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free, unbiased counseling on Medicare options, enrollment periods, and benefits for Alaska seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-medicaid-application", name: "Alaska Medicaid Application", description: "Official Alaska Medicaid application. Apply online or download a printable form.", url: "https://health.alaska.gov/dpa/Pages/medicaid/default.aspx" },
    ],
  },
  {
    id: "energy-assistance-program",
    name: "Energy Assistance Program",
    shortName: "Energy Assistance",
    tagline: "Alaska's LIHEAP program helps low-income households, including seniors, pay heating and energy costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Alaska's LIHEAP program helps low-income households, including seniors, pay heating and energy costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-energy-application", name: "Alaska Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://health.alaska.gov/dpa/Pages/hap/default.aspx" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities, investigating complaints and ensuring quality of care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities, investigating complaints and ensuring quality of care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals-seniorcare",
    name: "Home-Delivered Meals (SeniorCare)",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors through the SeniorCare program.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors through the SeniorCare program.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Supports family caregivers of seniors 60+ with services like respite care, caregiver training, counseling, and support groups.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Supports family caregivers of seniors 60+ with services like respite care, caregiver training, counseling, and support groups.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "alaska-legal-services-corporation-senior-legal-hotline",
    name: "Alaska Legal Services Corporation Senior Legal Hotline",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and consumer protection.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and consumer protection.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "senior-property-tax-exemption",
    name: "Senior Property Tax Exemption",
    shortName: "Property Tax Relief",
    tagline: "Alaska municipalities may offer property tax relief or exemptions for seniors 65+ to reduce housing costs.",
    savingsRange: "$500 – $2,500/year",
    description: "Alaska municipalities may offer property tax relief or exemptions for seniors 65+ to reduce housing costs.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "alaska-property-tax-application", name: "Alaska Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://health.alaska.gov/dpa/Pages/medicaid/default.aspx" },
    ],
  },
];

// ─── Arizona ─────────────────────────────────────────────────────────────────────

const arizonaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-abd-medicaid",
    name: "Aged, Blind, and Disabled (ABD) Medicaid",
    shortName: "ABD",
    tagline: "Provides healthcare coverage and long-term care services to financially limited seniors aged 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to financially limited seniors aged 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1255/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-medicaid-application", name: "Arizona Medicaid Application", description: "Official Arizona Medicaid application. Apply online or download a printable form.", url: "https://www.healthearizonaplus.gov" },
    ],
  },
  {
    id: "arizona-long-term-care-system-altcs",
    name: "Arizona Long Term Care System (ALTCS)",
    shortName: "ALTCS",
    tagline: "Medicaid HCBS waiver program providing long-term care services for elderly or disabled individuals at home.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Medicaid HCBS waiver program providing long-term care services for elderly or disabled individuals at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-medicaid-application", name: "Arizona Medicaid Application", description: "Official Arizona Medicaid application, required for waiver enrollment.", url: "https://www.healthearizonaplus.gov" },
      { id: "arizona-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.healthearizonaplus.gov" },
    ],
  },
  {
    id: "medicare-savings-programs-qmb-slmb-qi",
    name: "Medicare Savings Programs (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1600/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.healthearizonaplus.gov" },
    ],
  },
  {
    id: "nutrition-assistance-program",
    name: "Nutrition Assistance Program",
    shortName: "Nutrition Assistance Program",
    tagline: "Arizona's SNAP program providing food assistance benefits via EBT card to low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Arizona's SNAP program providing food assistance benefits via EBT card to low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2070/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-medicaid-application", name: "Arizona Medicaid Application", description: "Official Arizona Medicaid application. Apply online or download a printable form.", url: "https://www.healthearizonaplus.gov" },
    ],
  },
  {
    id: "arizona-senior-health-insurance-assistance-program-ship",
    name: "Arizona Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling service helping Medicare beneficiaries understand and choose health plans.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling service helping Medicare beneficiaries understand and choose health plans.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Provides financial assistance to low-income households, including seniors, to help with energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides financial assistance to low-income households, including seniors, to help with energy bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2950/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-energy-application", name: "Arizona Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://des.az.gov/services/basic-needs/shelter-housing/utility-assistance" },
    ],
  },
  {
    id: "senior-property-valuation-protection-option",
    name: "Senior Property Valuation Protection Option",
    shortName: "Senior Property Valuation",
    tagline: "Allows eligible seniors 65+ to lock in their property's Limited Property Value for tax purposes.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Allows eligible seniors 65+ to lock in their property's Limited Property Value for tax purposes.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-medicaid-application", name: "Arizona Medicaid Application", description: "Official Arizona Medicaid application. Apply online or download a printable form.", url: "https://www.healthearizonaplus.gov" },
    ],
  },
  {
    id: "arizona-long-term-care-ombudsman-program",
    name: "Arizona Long Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes.",
    savingsRange: "Free advocacy service",
    description: "Advocates for residents of long-term care facilities including nursing homes.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors unable to prepare their own meals.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors unable to prepare their own meals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "arizona-family-caregiver-support-program",
    name: "Arizona Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of seniors 60+ including respite care and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors 60+ including respite care and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "arizona-senior-legal-helpline",
    name: "Arizona Senior Legal Helpline",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal advice and brief services to seniors 60+ on issues like public benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal advice and brief services to seniors 60+ on issues like public benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arizona-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Arkansas ────────────────────────────────────────────────────────────────────

const arkansasPrograms: WaiverProgram[] = [
  {
    id: "regular-medicaid-aged-blind-and-disabled-aabd",
    name: "Regular Medicaid / Aged Blind and Disabled (AABD)",
    shortName: "AABD",
    tagline: "Provides full Medicaid health coverage for Arkansas seniors aged 65+ who are aged, blind, or disabled, covering medical care and long-term services.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides full Medicaid health coverage for Arkansas seniors aged 65+ who are aged, blind, or disabled, covering medical care and long-term services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1043/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-medicaid-application", name: "Arkansas Medicaid Application", description: "Official Arkansas Medicaid application. Apply online or download a printable form.", url: "https://access.arkansas.gov" },
    ],
  },
  {
    id: "medicare-savings-program",
    name: "Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries aged 65+ pay Medicare premiums, deductibles, and copays.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries aged 65+ pay Medicare premiums, deductibles, and copays.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1043/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://access.arkansas.gov" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides food assistance benefits to low-income seniors through an EBT card for purchasing nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides food assistance benefits to low-income seniors through an EBT card for purchasing nutritious food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1948/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-snap-application", name: "Arkansas SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://access.arkansas.gov" },
    ],
  },
  {
    id: "ark-choices-program-waiver",
    name: "ARK Choices Program Waiver",
    shortName: "ARK Choices Program Waiver",
    tagline: "Home and community-based services Medicaid waiver for seniors 65+ needing nursing home level care, providing personal care and support services.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waiver for seniors 65+ needing nursing home level care, providing personal care and support services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-medicaid-application", name: "Arkansas Medicaid Application", description: "Official Arkansas Medicaid application, required for waiver enrollment.", url: "https://access.arkansas.gov" },
      { id: "arkansas-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://access.arkansas.gov" },
    ],
  },
  {
    id: "senior-health-insurance-information-program-shiip",
    name: "Senior Health Insurance Information Program (SHIIP)",
    shortName: "SHIIP",
    tagline: "Offers free, unbiased counseling and assistance on Medicare, Medicare supplements, and prescription drug plans.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Offers free, unbiased counseling and assistance on Medicare, Medicare supplements, and prescription drug plans.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Integrates Medicare and Medicaid benefits for dual-eligible seniors needing nursing home level care in a community-based setting.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Integrates Medicare and Medicaid benefits for dual-eligible seniors needing nursing home level care in a community-based setting.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://access.arkansas.gov" },
      { id: "arkansas-medicaid-application", name: "Arkansas Medicaid Application", description: "Medicaid eligibility may be required. Apply through Arkansas's portal.", url: "https://access.arkansas.gov" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Assists low-income households, including seniors, with heating and cooling bills and energy crisis assistance.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists low-income households, including seniors, with heating and cooling bills and energy crisis assistance.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3106/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-energy-application", name: "Arkansas Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://humanservices.arkansas.gov/divisions/county-operations/lieap/" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors through the Older Americans Act program to support independent living.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors through the Older Americans Act program to support independent living.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3106/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3106/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "area-agency-on-aging-legal-services",
    name: "Area Agency on Aging Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors on issues like benefits, housing, and consumer protection.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors on issues like benefits, housing, and consumer protection.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3106/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "arkansas-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── California ──────────────────────────────────────────────────────────────────

const californiaPrograms: WaiverProgram[] = [
  {
    id: "medi-cal-for-aged-and-disabled",
    name: "Medi-Cal for Aged and Disabled",
    shortName: "Medi-Cal for Aged and Disabled",
    tagline: "California's Medicaid program for seniors 65+ and people with disabilities.",
    savingsRange: "$1,000 – $5,000/year",
    description: "California's Medicaid program for seniors 65+ and people with disabilities. Covers medical care, prescriptions, hospital stays, and long-term care services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1801/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-medicaid-application", name: "California Medicaid Application", description: "Official California Medicaid application. Apply online or download a printable form.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "in-home-supportive-services-ihss",
    name: "In-Home Supportive Services (IHSS)",
    shortName: "IHSS",
    tagline: "Personal care assistance for Medi-Cal recipients who are elderly, blind, or disabled.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Personal care assistance for Medi-Cal recipients who are elderly, blind, or disabled. Covers domestic services, meal preparation, and paramedical services.",
    eligibilityHighlights: [
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-medicaid-application", name: "California Medicaid Application", description: "Official California Medicaid application. Apply online or download a printable form.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "california-medicare-savings-programs",
    name: "California Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State programs that pay Medicare premiums and costs. QMB pays Part A & B premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State programs that pay Medicare premiums and costs. QMB pays Part A & B premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Income below $1762/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "multipurpose-senior-services-program-mssp",
    name: "Multipurpose Senior Services Program (MSSP)",
    shortName: "MSSP",
    tagline: "Medi-Cal waiver program for seniors who need nursing home level care but want to stay home. Coordinates community-based services.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Medi-Cal waiver program for seniors who need nursing home level care but want to stay home. Coordinates community-based services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1801/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "california-ssi-supplement", name: "California SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "calfresh-food-benefits-for-seniors",
    name: "CalFresh Food Benefits for Seniors",
    shortName: "SNAP/Food",
    tagline: "California's food stamps program (SNAP). SSI recipients are now eligible since expansion. Provides monthly benefits for food purchases.",
    savingsRange: "$1,500 – $3,600/year",
    description: "California's food stamps program (SNAP). SSI recipients are now eligible since expansion. Provides monthly benefits for food purchases.",
    eligibilityHighlights: [
      "Income below $1580/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-snap-application", name: "California SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.getcalfresh.org" },
    ],
  },
  {
    id: "ssi-ssp-cash-assistance",
    name: "SSI/SSP Cash Assistance",
    shortName: "SSI/SSP Cash Assistance",
    tagline: "Monthly cash benefits for low-income seniors 65+ or disabled. Federal SSI ($967/mo) plus California state supplement.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Monthly cash benefits for low-income seniors 65+ or disabled. Federal SSI ($967/mo) plus California state supplement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "california-ssi-supplement", name: "California SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "hicap-medicare-counseling",
    name: "HICAP Medicare Counseling",
    shortName: "HICAP Medicare Counseling",
    tagline: "Free, unbiased help understanding Medicare options. Trained counselors help you choose plans and resolve billing issues.",
    savingsRange: "Free counseling service",
    description: "Free, unbiased help understanding Medicare options. Trained counselors help you choose plans and resolve billing issues.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "california-assisted-living-waiver-alw",
    name: "California Assisted Living Waiver (ALW)",
    shortName: "ALW",
    tagline: "Medi-Cal pays for assisted living care at participating Residential Care Facilities for the Elderly.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medi-Cal pays for assisted living care at participating Residential Care Facilities for the Elderly.",
    eligibilityHighlights: [
      "Income below $1801/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-medicaid-application", name: "California Medicaid Application", description: "Official California Medicaid application, required for waiver enrollment.", url: "https://www.coveredca.com/apply" },
      { id: "california-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "california-liheap-energy-assistance",
    name: "California LIHEAP Energy Assistance",
    shortName: "Energy Assistance",
    tagline: "Helps pay heating and cooling bills. One-time payment sent directly to your utility company.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps pay heating and cooling bills. One-time payment sent directly to your utility company.",
    eligibilityHighlights: [
      "Income below $1928/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-energy-application", name: "California Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.csd.ca.gov/Pages/LIHEAP.aspx" },
    ],
  },
  {
    id: "california-caregiver-resource-centers",
    name: "California Caregiver Resource Centers",
    shortName: "Caregiver Support",
    tagline: "Free support for family caregivers including counseling, support groups, respite care, and legal/financial consultation.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Free support for family caregivers including counseling, support groups, respite care, and legal/financial consultation.",
    eligibilityHighlights: [
      "Age 18 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "california-pace-programs",
    name: "California PACE Programs",
    shortName: "California PACE Programs",
    tagline: "All-inclusive care centers in 27 California counties. Covers ALL medical care, prescriptions, transportation, and social services.",
    savingsRange: "$15,000 – $35,000/year",
    description: "All-inclusive care centers in 27 California counties. Covers ALL medical care, prescriptions, transportation, and social services.",
    eligibilityHighlights: [
      "Age 55 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.coveredca.com/apply" },
      { id: "california-medicaid-application", name: "California Medicaid Application", description: "Medicaid eligibility may be required. Apply through California's portal.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "property-tax-postponement-program",
    name: "Property Tax Postponement Program",
    shortName: "Property Tax Relief",
    tagline: "Defer property taxes on your home until you sell or move. Available for homeowners 62+ or disabled.",
    savingsRange: "$500 – $2,500/year",
    description: "Defer property taxes on your home until you sell or move. Available for homeowners 62+ or disabled.",
    eligibilityHighlights: [
      "Age 62 or older",
      "Income below $4599/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-property-tax-application", name: "California Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "california-home-delivered-meals",
    name: "California Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Nutritious meals delivered to your home through the Older Americans Act program. Available to adults 60+ regardless of income.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Nutritious meals delivered to your home through the Older Americans Act program. Available to adults 60+ regardless of income.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "250-california-working-disabled-program",
    name: "250% California Working Disabled Program",
    shortName: "250% California Working",
    tagline: "Medi-Cal for working people with disabilities whose income is too high for regular Medi-Cal.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Medi-Cal for working people with disabilities whose income is too high for regular Medi-Cal.",
    eligibilityHighlights: [
      "Income below $3263/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-medicaid-application", name: "California Medicaid Application", description: "Official California Medicaid application, required for waiver enrollment.", url: "https://www.coveredca.com/apply" },
      { id: "california-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.coveredca.com/apply" },
    ],
  },
  {
    id: "california-weatherization-assistance-program",
    name: "California Weatherization Assistance Program",
    shortName: "Weatherization",
    tagline: "Free home improvements to reduce energy costs including insulation, weather stripping, and furnace repair.",
    savingsRange: "$500 – $2,000/year",
    description: "Free home improvements to reduce energy costs including insulation, weather stripping, and furnace repair.",
    eligibilityHighlights: [
      "Income below $2570/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-energy-application", name: "California Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.csd.ca.gov/Pages/LIHEAP.aspx" },
    ],
  },
  {
    id: "california-long-term-care-ombudsman",
    name: "California Long-Term Care Ombudsman",
    shortName: "LTC Ombudsman",
    tagline: "Free advocates who resolve complaints and protect the rights of people in nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Free advocates who resolve complaints and protect the rights of people in nursing homes and assisted living.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "california-senior-legal-services",
    name: "California Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Free legal help for seniors 60+ on civil matters including benefits denials, housing disputes, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Free legal help for seniors 60+ on civil matters including benefits denials, housing disputes, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "senior-community-service-employment-program-scsep",
    name: "Senior Community Service Employment Program (SCSEP)",
    shortName: "SCSEP",
    tagline: "Paid job training for low-income seniors 55+. Work part-time at community organizations while learning new skills.",
    savingsRange: "$3,000 – $8,000/year",
    description: "Paid job training for low-income seniors 55+. Work part-time at community organizations while learning new skills.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1580/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "california-scsep-application", name: "Senior Employment Program Application", description: "Apply for part-time community service job training for low-income seniors aged 55+.", url: "https://www.dol.gov/agencies/eta/seniors" },
    ],
  },
];

// ─── Colorado ────────────────────────────────────────────────────────────────────

const coloradoPrograms: WaiverProgram[] = [
  {
    id: "health-first-colorado-medicaid-for-aged-blind-and-disabled",
    name: "Health First Colorado (Medicaid) for Aged, Blind, and Disabled",
    shortName: "ABD Medicaid",
    tagline: "Colorado's Medicaid program provides medical coverage for seniors 65+ and disabled individuals with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Colorado's Medicaid program provides medical coverage for seniors 65+ and disabled individuals with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-medicaid-application", name: "Colorado Medicaid Application", description: "Official Colorado Medicaid application. Apply online or download a printable form.", url: "https://www.healthfirstcolorado.com/apply-now/" },
    ],
  },
  {
    id: "elderly-blind-and-disabled-ebd-waiver",
    name: "Elderly, Blind, and Disabled (EBD) Waiver",
    shortName: "EBD",
    tagline: "Home and community-based services Medicaid waiver providing long-term supports like personal care, homemaker services, and adult day care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waiver providing long-term supports like personal care, homemaker services, and adult day care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-medicaid-application", name: "Colorado Medicaid Application", description: "Official Colorado Medicaid application, required for waiver enrollment.", url: "https://www.healthfirstcolorado.com/apply-now/" },
      { id: "colorado-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.healthfirstcolorado.com/apply-now/" },
    ],
  },
  {
    id: "medicare-buy-in-programs-qmb-slmb-qi",
    name: "Medicare Buy-In Programs (QMB, SLMB, QI)",
    shortName: "Medicare Buy-In Programs",
    tagline: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1400/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.healthfirstcolorado.com/apply-now/" },
    ],
  },
  {
    id: "colorado-snap-supplemental-nutrition-assistance-program",
    name: "Colorado SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via an EBT card to purchase nutritious food for eligible low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via an EBT card to purchase nutritious food for eligible low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-snap-application", name: "Colorado SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://peak-colorado.state.co.us" },
    ],
  },
  {
    id: "colorado-state-health-insurance-assistance-program-ship",
    name: "Colorado State Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on enrollment, coverage options, and appeals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries on enrollment, coverage options, and appeals.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "colorado-pace-program",
    name: "Colorado PACE Program",
    shortName: "Colorado PACE Program",
    tagline: "Comprehensive healthcare and social services for frail seniors 55+ eligible for Medicaid nursing facility care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Comprehensive healthcare and social services for frail seniors 55+ eligible for Medicaid nursing facility care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1370/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.healthfirstcolorado.com/apply-now/" },
      { id: "colorado-medicaid-application", name: "Colorado Medicaid Application", description: "Medicaid eligibility may be required. Apply through Colorado's portal.", url: "https://www.healthfirstcolorado.com/apply-now/" },
    ],
  },
  {
    id: "colorado-energy-assistance-program-leap",
    name: "Colorado Energy Assistance Program (LEAP)",
    shortName: "LEAP",
    tagline: "Low-income Energy Assistance Program provides a one-time payment toward home energy bills during winter.",
    savingsRange: "$500 – $2,000/year",
    description: "Low-income Energy Assistance Program provides a one-time payment toward home energy bills during winter.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2825/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-energy-application", name: "Colorado Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://cdhs.colorado.gov/leap" },
    ],
  },
  {
    id: "senior-property-tax-exemption-ptex",
    name: "Senior Property Tax Exemption (PTEX)",
    shortName: "PTEX",
    tagline: "Provides property tax exemption for owner-occupied homes of seniors 65+ meeting income requirements.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides property tax exemption for owner-occupied homes of seniors 65+ meeting income requirements.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $16241/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-property-tax-application", name: "Colorado Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.healthfirstcolorado.com/apply-now/" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors unable to prepare food independently.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors unable to prepare food independently.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2825/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "colorado-legal-services-for-seniors",
    name: "Colorado Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors on issues like housing, benefits, and consumer protection.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors on issues like housing, benefits, and consumer protection.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "colorado-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Connecticut ─────────────────────────────────────────────────────────────────

const connecticutPrograms: WaiverProgram[] = [
  {
    id: "husky-c-aged-blind-and-disabled-medicaid",
    name: "HUSKY C (Aged, Blind, and Disabled Medicaid)",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare coverage and long-term care services to low-income seniors aged 65+ and disabled individuals.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to low-income seniors aged 65+ and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1370/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-medicaid-application", name: "Connecticut Medicaid Application", description: "Official Connecticut Medicaid application. Apply online or download a printable form.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "medicare-savings-program-qmb-slmb-qi",
    name: "Medicare Savings Program (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "connecticut-home-care-program-for-elders-chcpe-waiver",
    name: "Connecticut Home Care Program for Elders (CHCPE) Waiver",
    shortName: "CHCPE",
    tagline: "Medicaid HCBS waiver providing personal care, homemaker services, and adult day care to help seniors remain at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing personal care, homemaker services, and adult day care to help seniors remain at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1370/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-medicaid-application", name: "Connecticut Medicaid Application", description: "Official Connecticut Medicaid application, required for waiver enrollment.", url: "https://www.connect.ct.gov" },
      { id: "connecticut-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-snap-application", name: "Connecticut SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "connecticut-state-ssi-supplement",
    name: "Connecticut State SSI Supplement",
    shortName: "SSI Supplement",
    tagline: "Optional state supplement to federal SSI payments for aged, blind, and disabled individuals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Optional state supplement to federal SSI payments for aged, blind, and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1370/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "connecticut-ssi-supplement", name: "Connecticut SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "connecticut-pace-program",
    name: "Connecticut PACE Program",
    shortName: "Connecticut PACE Program",
    tagline: "Program of All-Inclusive Care for the Elderly provides comprehensive medical and social services for frail seniors.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Program of All-Inclusive Care for the Elderly provides comprehensive medical and social services for frail seniors.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1370/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.connect.ct.gov" },
      { id: "connecticut-medicaid-application", name: "Connecticut Medicaid Application", description: "Medicaid eligibility may be required. Apply through Connecticut's portal.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "connecticut-property-tax-relief-for-seniors",
    name: "Connecticut Property Tax Relief for Seniors",
    shortName: "Property Tax Relief",
    tagline: "State circuit breaker program providing tax relief credits to elderly and disabled homeowners and renters.",
    savingsRange: "$500 – $2,500/year",
    description: "State circuit breaker program providing tax relief credits to elderly and disabled homeowners and renters.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $33000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-property-tax-application", name: "Connecticut Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "connpace-connecticut-pharmaceutical-assistance",
    name: "ConnPace (Connecticut Pharmaceutical Assistance)",
    shortName: "ConnPace (Connecticut",
    tagline: "State program providing prescription drug cost-sharing assistance to low-income seniors 65+.",
    savingsRange: "$15,000 – $35,000/year",
    description: "State program providing prescription drug cost-sharing assistance to low-income seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $33000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.connect.ct.gov" },
      { id: "connecticut-medicaid-application", name: "Connecticut Medicaid Application", description: "Medicaid eligibility may be required. Apply through Connecticut's portal.", url: "https://www.connect.ct.gov" },
    ],
  },
  {
    id: "connecticut-energy-assistance-program-ceap",
    name: "Connecticut Energy Assistance Program (CEAP)",
    shortName: "CEAP",
    tagline: "Provides cash grants to help eligible low-income households, including seniors, pay energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides cash grants to help eligible low-income households, including seniors, pay energy bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-energy-application", name: "Connecticut Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://portal.ct.gov/DSS/Economic-Security/Winter-Heating-Assistance" },
    ],
  },
  {
    id: "national-family-caregiver-support-program-connecticut",
    name: "National Family Caregiver Support Program (Connecticut)",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "connecticut-health-insurance-assistance-program-ship",
    name: "Connecticut Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Offers free, personalized counseling on Medicare options, coverage, and costs.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Offers free, personalized counseling on Medicare options, coverage, and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "connecticut-home-delivered-meals-program",
    name: "Connecticut Home-Delivered Meals Program",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors through Area Agencies on Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors through Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "senior-legal-services-elder-law-hotlines",
    name: "Senior Legal Services (Elder Law Hotlines)",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal advice and representation for low-income seniors on benefits and housing issues.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal advice and representation for low-income seniors on benefits and housing issues.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities, investigating complaints and ensuring quality care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities, investigating complaints and ensuring quality care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "connecticut-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
];

// ─── Delaware ────────────────────────────────────────────────────────────────────

const delawarePrograms: WaiverProgram[] = [
  {
    id: "regular-medicaid-aged-blind-and-disabled",
    name: "Regular Medicaid / Aged Blind and Disabled",
    shortName: "ABD Medicaid",
    tagline: "Delaware's Medicaid program for seniors aged 65+ and individuals who are aged, blind, or disabled, providing health coverage.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Delaware's Medicaid program for seniors aged 65+ and individuals who are aged, blind, or disabled, providing health coverage.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-medicaid-application", name: "Delaware Medicaid Application", description: "Official Delaware Medicaid application. Apply online or download a printable form.", url: "https://dhss.delaware.gov/dhss/dmma/medicaid.html" },
    ],
  },
  {
    id: "diamond-state-health-plan-plus-long-term-care-community-serv",
    name: "Diamond State Health Plan Plus - Long Term Care Community Services",
    shortName: "Diamond State Health Plan",
    tagline: "Home and community-based services program serving nursing home-qualified seniors with personal care and support.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Home and community-based services program serving nursing home-qualified seniors with personal care and support.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2485/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-medicaid-application", name: "Delaware Medicaid Application", description: "Official Delaware Medicaid application. Apply online or download a printable form.", url: "https://dhss.delaware.gov/dhss/dmma/medicaid.html" },
    ],
  },
  {
    id: "medicare-savings-program-qmb-slmb-qi",
    name: "Medicare Savings Program (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://dhss.delaware.gov/dhss/dmma/medicaid.html" },
    ],
  },
  {
    id: "food-stamp-program-snap",
    name: "Food Stamp Program (SNAP)",
    shortName: "SNAP",
    tagline: "Delaware's Supplemental Nutrition Assistance Program provides monthly benefits to low-income seniors for food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delaware's Supplemental Nutrition Assistance Program provides monthly benefits to low-income seniors for food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2081/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-snap-application", name: "Delaware SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dhss.delaware.gov/dhss/dss/foodstamps.html" },
    ],
  },
  {
    id: "delaware-energy-assistance-program",
    name: "Delaware Energy Assistance Program",
    shortName: "Energy Assistance",
    tagline: "Low-Income Home Energy Assistance Program helps eligible low-income households with heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Low-Income Home Energy Assistance Program helps eligible low-income households with heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2820/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-energy-application", name: "Delaware Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dhss.delaware.gov/dhss/dss/liheap.html" },
    ],
  },
  {
    id: "delaware-ship-medicare-counseling",
    name: "Delaware SHIP Medicare Counseling",
    shortName: "Delaware SHIP Medicare",
    tagline: "State Health Insurance Assistance Program provides free, unbiased counseling on Medicare options.",
    savingsRange: "Free counseling service",
    description: "State Health Insurance Assistance Program provides free, unbiased counseling on Medicare options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "delaware-long-term-care-ombudsman-program",
    name: "Delaware Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "delaware-home-delivered-meals",
    name: "Delaware Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors through local senior centers and community programs.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors through local senior centers and community programs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2820/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program-delaware",
    name: "National Family Caregiver Support Program - Delaware",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of seniors aged 60+ including respite care and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors aged 60+ including respite care and training.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $36000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "delaware-legal-help-link-for-seniors",
    name: "Delaware Legal Help Link for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Connects Delaware seniors aged 60+ with free legal services for civil matters including benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Connects Delaware seniors aged 60+ with free legal services for civil matters including benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "delaware-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Florida ─────────────────────────────────────────────────────────────────────

const floridaPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-and-disabled-meds-ad",
    name: "Medicaid for Aged and Disabled (MEDS-AD)",
    shortName: "MEDS-AD",
    tagline: "Provides healthcare coverage and long-term care services to financially limited seniors aged 65+ and disabled individuals.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to financially limited seniors aged 65+ and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1149/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-medicaid-application", name: "Florida Medicaid Application", description: "Official Florida Medicaid application. Apply online or download a printable form.", url: "https://www.myflfamilies.com/services/public-assistance/medicaid" },
    ],
  },
  {
    id: "statewide-medicaid-managed-care-long-term-care-smmc-ltc",
    name: "Statewide Medicaid Managed Care Long-Term Care (SMMC-LTC)",
    shortName: "SMMC-LTC",
    tagline: "Medicaid waiver program providing home and community-based services to prevent nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver program providing home and community-based services to prevent nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2816/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-medicaid-application", name: "Florida Medicaid Application", description: "Official Florida Medicaid application. Apply online or download a printable form.", url: "https://www.myflfamilies.com/services/public-assistance/medicaid" },
    ],
  },
  {
    id: "medicare-savings-program-qmb-slmb-qi",
    name: "Medicare Savings Program (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and copays.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and copays.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1308/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.myflfamilies.com/services/public-assistance/medicaid" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-snap-application", name: "Florida SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.myflfamilies.com/services/public-assistance/snap" },
    ],
  },
  {
    id: "shine-serving-health-insurance-needs-of-elders",
    name: "SHINE (Serving Health Insurance Needs of Elders)",
    shortName: "SHINE (Serving Health",
    tagline: "Free, unbiased counseling and enrollment assistance for Medicare beneficiaries and caregivers.",
    savingsRange: "Free counseling service",
    description: "Free, unbiased counseling and enrollment assistance for Medicare beneficiaries and caregivers.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including caregiver training, respite care, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including caregiver training, respite care, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists eligible low-income households, including seniors, with paying energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income households, including seniors, with paying energy bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-energy-application", name: "Florida Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.myflfamilies.com/services/public-assistance/liheap" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors 60+ unable to prepare their own meals.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors 60+ unable to prepare their own meals.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-services-for-seniors",
    name: "Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and elder abuse.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "florida-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Georgia ─────────────────────────────────────────────────────────────────────

const georgiaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid-abd",
    name: "Aged, Blind and Disabled Medicaid (ABD)",
    shortName: "ABD",
    tagline: "Provides medical assistance to Georgia seniors aged 65+ who are low-income, aged, blind, or disabled.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides medical assistance to Georgia seniors aged 65+ who are low-income, aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-medicaid-application", name: "Georgia Medicaid Application", description: "Official Georgia Medicaid application. Apply online or download a printable form.", url: "https://gateway.ga.gov" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://gateway.ga.gov" },
    ],
  },
  {
    id: "elderly-and-disabled-waiver-program-edwp",
    name: "Elderly and Disabled Waiver Program (EDWP)",
    shortName: "EDWP",
    tagline: "Medicaid HCBS waiver providing in-home services like personal care, adult day care, and respite to prevent nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing in-home services like personal care, adult day care, and respite to prevent nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2982/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-medicaid-application", name: "Georgia Medicaid Application", description: "Official Georgia Medicaid application, required for waiver enrollment.", url: "https://gateway.ga.gov" },
      { id: "georgia-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://gateway.ga.gov" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits to low-income seniors to purchase nutritious food via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits to low-income seniors to purchase nutritious food via EBT card.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1982/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-snap-application", name: "Georgia SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://gateway.ga.gov" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists eligible low-income households, including seniors, with heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income households, including seniors, with heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3090/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-energy-application", name: "Georgia Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dfcs.georgia.gov/services/low-income-home-energy-assistance-program" },
    ],
  },
  {
    id: "home-delivered-meals-georgia-elderly-nutrition-program",
    name: "Home-Delivered Meals (Georgia Elderly Nutrition Program)",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors to promote independence and health.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors to promote independence and health.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "georgia-family-caregiver-support-program",
    name: "Georgia Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3465/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "georgia-senior-medicare-patrol-gsmp",
    name: "Georgia Senior Medicare Patrol (GSMP)",
    shortName: "GSMP",
    tagline: "Free counseling and education on Medicare rights, options, and fraud prevention for seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free counseling and education on Medicare rights, options, and fraud prevention for seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-smp-referral", name: "Senior Medicare Patrol Volunteer/Referral Form", description: "Report suspected Medicare fraud, errors, or abuse, or volunteer as a counselor.", url: "https://www.smpresource.org" },
    ],
  },
  {
    id: "georgia-legal-services-program-senior-services",
    name: "Georgia Legal Services Program - Senior Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors on issues like housing, benefits, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors on issues like housing, benefits, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2496/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "georgia-long-term-care-ombudsman-program",
    name: "Georgia Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "georgia-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
];

// ─── Hawaii ──────────────────────────────────────────────────────────────────────

const hawaiiPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-abd-medicaid",
    name: "Aged, Blind, and Disabled (ABD) Medicaid",
    shortName: "ABD",
    tagline: "Hawaii's ABD Medicaid provides healthcare coverage and long-term care benefits to seniors 65+ with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Hawaii's ABD Medicaid provides healthcare coverage and long-term care benefits to seniors 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "hawaii-medicaid-application", name: "Hawaii Medicaid Application", description: "Official Hawaii Medicaid application. Apply online or download a printable form.", url: "https://medquest.hawaii.gov" },
    ],
  },
  {
    id: "home-and-community-based-services-hcbs-waiver",
    name: "Home and Community-Based Services (HCBS) Waiver",
    shortName: "HCBS",
    tagline: "Hawaii's HCBS Waiver provides Medicaid-covered long-term care services and supports to help seniors remain at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Hawaii's HCBS Waiver provides Medicaid-covered long-term care services and supports to help seniors remain at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1500/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "hawaii-medicaid-application", name: "Hawaii Medicaid Application", description: "Official Hawaii Medicaid application, required for waiver enrollment.", url: "https://medquest.hawaii.gov" },
      { id: "hawaii-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://medquest.hawaii.gov" },
    ],
  },
  {
    id: "assistance-to-the-aged-blind-and-disabled-aabd",
    name: "Assistance to the Aged, Blind and Disabled (AABD)",
    shortName: "AABD",
    tagline: "The AABD program provides cash benefits for food, clothing, shelter, and other essentials to low-income seniors.",
    savingsRange: "$3,000 – $10,000/year",
    description: "The AABD program provides cash benefits for food, clothing, shelter, and other essentials to low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $510/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "hawaii-medicaid-application", name: "Hawaii Medicaid Application", description: "Official Hawaii Medicaid application. Apply online or download a printable form.", url: "https://medquest.hawaii.gov" },
    ],
  },
];

// ─── Idaho ───────────────────────────────────────────────────────────────────────

const idahoPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-disabled",
    name: "Medicaid for Aged/Disabled",
    shortName: "ABD Medicaid",
    tagline: "Idaho's Medicaid program for seniors 65+ and adults with disabilities provides health coverage and long-term care.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Idaho's Medicaid program for seniors 65+ and adults with disabilities provides health coverage and long-term care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2921/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-medicaid-application", name: "Idaho Medicaid Application", description: "Official Idaho Medicaid application. Apply online or download a printable form.", url: "https://idalink.idaho.gov" },
    ],
  },
  {
    id: "aged-and-disabled-a-d-waiver",
    name: "Aged and Disabled (A&D) Waiver",
    shortName: "A&D",
    tagline: "The A&D HCBS Waiver provides long-term care services to seniors 65+ and disabled adults at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The A&D HCBS Waiver provides long-term care services to seniors 65+ and disabled adults at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2921/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-medicaid-application", name: "Idaho Medicaid Application", description: "Official Idaho Medicaid application, required for waiver enrollment.", url: "https://idalink.idaho.gov" },
      { id: "idaho-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://idalink.idaho.gov" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Idaho's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Idaho's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1603/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://idalink.idaho.gov" },
    ],
  },
  {
    id: "idaho-supplemental-nutrition-assistance-program-snap",
    name: "Idaho Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "SNAP provides monthly benefits to low-income seniors to purchase nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "SNAP provides monthly benefits to low-income seniors to purchase nutritious food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-snap-application", name: "Idaho SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://idalink.idaho.gov" },
    ],
  },
  {
    id: "idaho-senior-health-insurance-assistance-program-ship",
    name: "Idaho Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "SHIP provides free, unbiased counseling on Medicare options, coverage, and help choosing plans.",
    savingsRange: "$3,000 – $10,000/year",
    description: "SHIP provides free, unbiased counseling on Medicare options, coverage, and help choosing plans.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "LIHEAP helps eligible low-income households, including seniors, pay heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "LIHEAP helps eligible low-income households, including seniors, pay heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3090/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-energy-application", name: "Idaho Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://healthandwelfare.idaho.gov/services-programs/financial-assistance/low-income-home-energy-assistance-program" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "The Ombudsman Program advocates for residents of long-term care facilities and resolves complaints.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The Ombudsman Program advocates for residents of long-term care facilities and resolves complaints.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors through Area Agencies on Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors through Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3090/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of seniors 60+, including respite care and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors 60+, including respite care and training.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3090/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "idaho-legal-aid-services",
    name: "Idaho Legal Aid Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors on issues like benefits, housing, and consumer rights.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors on issues like benefits, housing, and consumer rights.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "idaho-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Illinois ────────────────────────────────────────────────────────────────────

const illinoisPrograms: WaiverProgram[] = [
  {
    id: "aid-to-the-aged-blind-and-disabled-aabd-medicaid",
    name: "Aid to the Aged, Blind, and Disabled (AABD) Medicaid",
    shortName: "AABD",
    tagline: "Provides Medicaid health coverage for low-income seniors aged 65+ who are aged, blind, or disabled.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides Medicaid health coverage for low-income seniors aged 65+ who are aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-medicaid-application", name: "Illinois Medicaid Application", description: "Official Illinois Medicaid application. Apply online or download a printable form.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "hcbs-medicaid-waiver-programs",
    name: "HCBS Medicaid Waiver Programs",
    shortName: "HCBS Medicaid Waiver Programs",
    tagline: "Home and Community-Based Services waivers provide long-term care services like personal care, adult day care, and respite.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and Community-Based Services waivers provide long-term care services like personal care, adult day care, and respite.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-medicaid-application", name: "Illinois Medicaid Application", description: "Official Illinois Medicaid application, required for waiver enrollment.", url: "https://abe.illinois.gov/abe/access/" },
      { id: "illinois-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly food assistance benefits to low-income seniors to purchase nutritious food via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly food assistance benefits to low-income seniors to purchase nutritious food via EBT card.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-snap-application", name: "Illinois SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Provides comprehensive medical and social services to frail seniors eligible for nursing home care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Provides comprehensive medical and social services to frail seniors eligible for nursing home care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1304/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://abe.illinois.gov/abe/access/" },
      { id: "illinois-medicaid-application", name: "Illinois Medicaid Application", description: "Medicaid eligibility may be required. Apply through Illinois's portal.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "aid-to-the-aged-blind-and-disabled-aabd-cash-assistance",
    name: "Aid to the Aged, Blind, and Disabled (AABD) Cash Assistance",
    shortName: "AABD",
    tagline: "Provides monthly cash grants to low-income seniors aged 65+ who are aged, blind, or disabled.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides monthly cash grants to low-income seniors aged 65+ who are aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-medicaid-application", name: "Illinois Medicaid Application", description: "Official Illinois Medicaid application. Apply online or download a printable form.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Provides assistance to eligible low-income households, including seniors, to pay heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides assistance to eligible low-income households, including seniors, to pay heating and cooling bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-energy-application", name: "Illinois Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www2.illinois.gov/dceo/CommunityServices/HomeWeatherization/Pages/default.aspx" },
    ],
  },
  {
    id: "senior-citizens-property-tax-freeze",
    name: "Senior Citizens Property Tax Freeze",
    shortName: "Property Tax Relief",
    tagline: "Freezes property taxes for eligible seniors aged 65+ with income below limits.",
    savingsRange: "$500 – $2,500/year",
    description: "Freezes property taxes for eligible seniors aged 65+ with income below limits.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $75000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-property-tax-application", name: "Illinois Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://abe.illinois.gov/abe/access/" },
    ],
  },
  {
    id: "illinois-ship-senior-health-insurance-program",
    name: "Illinois SHIP (Senior Health Insurance Program)",
    shortName: "Illinois SHIP (Senior Health",
    tagline: "Free counseling service providing personalized assistance with Medicare choices and enrollment.",
    savingsRange: "Free counseling service",
    description: "Free counseling service providing personalized assistance with Medicare choices and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality of care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality of care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "community-care-program-home-delivered-meals",
    name: "Community Care Program Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors to promote independence and health.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors to promote independence and health.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "senior-legal-hotline",
    name: "Senior Legal Hotline",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal advice and brief services to low-income seniors on issues like benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal advice and brief services to low-income seniors on issues like benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers of seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "illinois-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Indiana ─────────────────────────────────────────────────────────────────────

const indianaPrograms: WaiverProgram[] = [
  {
    id: "indiana-pathways-for-aging",
    name: "Indiana PathWays for Aging",
    shortName: "Indiana PathWays for Aging",
    tagline: "Indiana PathWays for Aging is the state's Medicaid program for Hoosiers aged 60+ providing health and long-term care services.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Indiana PathWays for Aging is the state's Medicaid program for Hoosiers aged 60+ providing health and long-term care services.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1200/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-medicaid-application", name: "Indiana Medicaid Application", description: "Official Indiana Medicaid application. Apply online or download a printable form.", url: "https://fssabenefits.in.gov" },
    ],
  },
  {
    id: "pathways-for-aging-waiver",
    name: "PathWays for Aging Waiver",
    shortName: "PathWays for Aging Waiver",
    tagline: "The PathWays for Aging Waiver provides home and community-based services (HCBS) for seniors needing nursing-level care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The PathWays for Aging Waiver provides home and community-based services (HCBS) for seniors needing nursing-level care.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1200/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-medicaid-application", name: "Indiana Medicaid Application", description: "Official Indiana Medicaid application, required for waiver enrollment.", url: "https://fssabenefits.in.gov" },
      { id: "indiana-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://fssabenefits.in.gov" },
    ],
  },
  {
    id: "hoosier-rx-medicare-savings-programs",
    name: "Hoosier RX: Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Indiana's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries pay for costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Indiana's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries pay for costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1407/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://fssabenefits.in.gov" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Indiana's SNAP provides food assistance benefits via an EBT card to low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Indiana's SNAP provides food assistance benefits via an EBT card to low-income seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-snap-application", name: "Indiana SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://fssabenefits.in.gov" },
    ],
  },
  {
    id: "indiana-senior-health-insurance-assistance-program-ship",
    name: "Indiana Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "SHIP provides free, unbiased counseling to Medicare beneficiaries on coverage options and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "SHIP provides free, unbiased counseling to Medicare beneficiaries on coverage options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "indiana-energy-assistance-program-ieap",
    name: "Indiana Energy Assistance Program (IEAP)",
    shortName: "IEAP",
    tagline: "IEAP provides grants to help eligible low-income households, including seniors, with heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "IEAP provides grants to help eligible low-income households, including seniors, with heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3092/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-energy-application", name: "Indiana Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.in.gov/ihcda/homeowners-and-renters/energy-assistance-program/" },
    ],
  },
  {
    id: "national-family-caregiver-support-program-nfcsp",
    name: "National Family Caregiver Support Program (NFCSP)",
    shortName: "NFCSP",
    tagline: "Provides support services for family caregivers of seniors 60+, including respite care, training, and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services for family caregivers of seniors 60+, including respite care, training, and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3092/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "indiana-long-term-care-ombudsman-program",
    name: "Indiana Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "The Ombudsman Program advocates for residents of long-term care facilities, investigating complaints.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The Ombudsman Program advocates for residents of long-term care facilities, investigating complaints.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Home-delivered meals provide nutritious meals to homebound seniors to support health and independence.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Home-delivered meals provide nutritious meals to homebound seniors to support health and independence.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "indiana-legal-services-for-seniors",
    name: "Indiana Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and consumer rights.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and consumer rights.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "indiana-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Iowa ────────────────────────────────────────────────────────────────────────

const iowaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-abd-medicaid",
    name: "Aged, Blind, and Disabled (ABD) Medicaid",
    shortName: "ABD",
    tagline: "Iowa's ABD Medicaid provides healthcare coverage and long-term care benefits to seniors 65+ with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Iowa's ABD Medicaid provides healthcare coverage and long-term care benefits to seniors 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "iowa-medicaid-application", name: "Iowa Medicaid Application", description: "Official Iowa Medicaid application. Apply online or download a printable form.", url: "https://dhsservices.iowa.gov" },
    ],
  },
  {
    id: "nursing-home-medicaid",
    name: "Nursing Home Medicaid",
    shortName: "Nursing Home Medicaid",
    tagline: "Iowa Medicaid program for seniors requiring nursing home care, covering room, board, and nursing services.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Iowa Medicaid program for seniors requiring nursing home care, covering room, board, and nursing services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "iowa-medicaid-application", name: "Iowa Medicaid Application", description: "Official Iowa Medicaid application. Apply online or download a printable form.", url: "https://dhsservices.iowa.gov" },
    ],
  },
  {
    id: "elderly-waiver-program-hcbs-waiver",
    name: "Elderly Waiver Program (HCBS Waiver)",
    shortName: "Elderly Waiver Program (HCBS",
    tagline: "Iowa's Medicaid waiver program helps seniors aged 65+ stay in their homes with home and community-based services.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Iowa's Medicaid waiver program helps seniors aged 65+ stay in their homes with home and community-based services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "iowa-medicaid-application", name: "Iowa Medicaid Application", description: "Official Iowa Medicaid application, required for waiver enrollment.", url: "https://dhsservices.iowa.gov" },
      { id: "iowa-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dhsservices.iowa.gov" },
    ],
  },
];

// ─── Kansas ──────────────────────────────────────────────────────────────────────

const kansasPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare coverage and long-term care services to financially needy Kansas seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to financially needy Kansas seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-medicaid-application", name: "Kansas Medicaid Application", description: "Official Kansas Medicaid application. Apply online or download a printable form.", url: "https://www.kancare.ks.gov/consumers/apply-for-kancare" },
    ],
  },
  {
    id: "home-and-community-based-services-for-the-frail-elderly-waiv",
    name: "Home and Community Based Services for the Frail Elderly Waiver",
    shortName: "Home and Community Based",
    tagline: "Medicaid waiver providing long-term services and supports to seniors 65+ at risk of nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver providing long-term services and supports to seniors 65+ at risk of nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-medicaid-application", name: "Kansas Medicaid Application", description: "Official Kansas Medicaid application, required for waiver enrollment.", url: "https://www.kancare.ks.gov/consumers/apply-for-kancare" },
      { id: "kansas-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.kancare.ks.gov/consumers/apply-for-kancare" },
    ],
  },
  {
    id: "kancare-medicare-buy-in-programs",
    name: "KanCare Medicare Buy-In Programs",
    shortName: "KanCare Medicare Buy-In",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$1,000 – $5,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.kancare.ks.gov/consumers/apply-for-kancare" },
    ],
  },
  {
    id: "kansas-food-assistance-program",
    name: "Kansas Food Assistance Program",
    shortName: "SNAP/Food",
    tagline: "Provides food assistance benefits to low-income seniors to purchase nutritious food via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides food assistance benefits to low-income seniors to purchase nutritious food via EBT card.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1922/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-snap-application", name: "Kansas SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.dcf.ks.gov/services/ees/Pages/Food/FoodAssistance.aspx" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Comprehensive program for Medicaid-eligible seniors 55+ requiring nursing facility level of care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Comprehensive program for Medicaid-eligible seniors 55+ requiring nursing facility level of care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $967/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.kancare.ks.gov/consumers/apply-for-kancare" },
      { id: "kansas-medicaid-application", name: "Kansas Medicaid Application", description: "Medicaid eligibility may be required. Apply through Kansas's portal.", url: "https://www.kancare.ks.gov/consumers/apply-for-kancare" },
    ],
  },
  {
    id: "senior-health-insurance-counseling-for-kansas",
    name: "Senior Health Insurance Counseling for Kansas",
    shortName: "Senior Health Insurance",
    tagline: "Free, unbiased counseling assistance for Medicare beneficiaries and caregivers on coverage options.",
    savingsRange: "Free counseling service",
    description: "Free, unbiased counseling assistance for Medicare beneficiaries and caregivers on coverage options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-energy-assistance-program",
    name: "Low-Income Energy Assistance Program",
    shortName: "Energy Assistance",
    tagline: "Assists low-income households, including seniors, with heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists low-income households, including seniors, with heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3091/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-energy-application", name: "Kansas Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.dcf.ks.gov/services/ees/Pages/Energy/EnergyAssistance.aspx" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including caregiver training, respite care, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including caregiver training, respite care, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3091/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3091/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-assistance-for-older-kansans",
    name: "Legal Assistance for Older Kansans",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal services to low-income seniors facing issues like housing, benefits, and consumer protection.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides free legal services to low-income seniors facing issues like housing, benefits, and consumer protection.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3091/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kansas-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Kentucky ────────────────────────────────────────────────────────────────────

const kentuckyPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-abd-medicaid",
    name: "Aged, Blind, and Disabled (ABD) Medicaid",
    shortName: "ABD",
    tagline: "Provides healthcare coverage and long-term care services to financially limited Kentucky seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to financially limited Kentucky seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $235/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-medicaid-application", name: "Kentucky Medicaid Application", description: "Official Kentucky Medicaid application. Apply online or download a printable form.", url: "https://kynect.ky.gov" },
    ],
  },
  {
    id: "home-and-community-based-hcb-waiver",
    name: "Home and Community Based (HCB) Waiver",
    shortName: "HCB",
    tagline: "Medicaid waiver providing long-term care services to seniors requiring nursing home level of care at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver providing long-term care services to seniors requiring nursing home level of care at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-medicaid-application", name: "Kentucky Medicaid Application", description: "Official Kentucky Medicaid application, required for waiver enrollment.", url: "https://kynect.ky.gov" },
      { id: "kentucky-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://kynect.ky.gov" },
    ],
  },
  {
    id: "medicare-savings-programs-qmb-slmb-qi",
    name: "Medicare Savings Programs (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://kynect.ky.gov" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits to low-income seniors to purchase nutritious food via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits to low-income seniors to purchase nutritious food via EBT card.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-snap-application", name: "Kentucky SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://kynect.ky.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Provides comprehensive medical and social services to frail seniors aged 55+ needing nursing-level care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Provides comprehensive medical and social services to frail seniors aged 55+ needing nursing-level care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://kynect.ky.gov" },
      { id: "kentucky-medicaid-application", name: "Kentucky Medicaid Application", description: "Medicaid eligibility may be required. Apply through Kentucky's portal.", url: "https://kynect.ky.gov" },
    ],
  },
  {
    id: "kentucky-ship-state-health-insurance-assistance-program",
    name: "Kentucky SHIP (State Health Insurance Assistance Program)",
    shortName: "Kentucky SHIP (State Health",
    tagline: "Provides free, unbiased counseling and assistance to Medicare beneficiaries on coverage and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides free, unbiased counseling and assistance to Medicare beneficiaries on coverage and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Helps eligible low-income households, including seniors, pay heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps eligible low-income households, including seniors, pay heating and cooling bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2470/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-energy-application", name: "Kentucky Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://chfrankfort.org/liheap/" },
    ],
  },
  {
    id: "national-family-caregiver-support-program-nfcsp",
    name: "National Family Caregiver Support Program (NFCSP)",
    shortName: "NFCSP",
    tagline: "Provides support services to family caregivers of seniors aged 60+ including respite care and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors aged 60+ including respite care and training.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2470/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "kentucky-long-term-care-ombudsman-program",
    name: "Kentucky Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals-dail",
    name: "Home-Delivered Meals (DAIL)",
    shortName: "DAIL",
    tagline: "Provides nutritious meals delivered to homebound seniors who are unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors who are unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2470/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "area-agency-on-aging-legal-services",
    name: "Area Agency on Aging Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors through Kentucky's Area Agencies on Aging.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors through Kentucky's Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2470/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "ky-property-tax-homestead-exemption",
    name: "KY Property Tax Homestead Exemption",
    shortName: "Property Tax Relief",
    tagline: "Provides property tax relief for seniors aged 65+ who are disabled or have income below certain limits.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides property tax relief for seniors aged 65+ who are disabled or have income below certain limits.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $52000/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "kentucky-property-tax-application", name: "Kentucky Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://kynect.ky.gov" },
    ],
  },
];

// ─── Louisiana ───────────────────────────────────────────────────────────────────

const louisianaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare coverage and long-term care services to Louisiana residents aged 65+ with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to Louisiana residents aged 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-medicaid-application", name: "Louisiana Medicaid Application", description: "Official Louisiana Medicaid application. Apply online or download a printable form.", url: "https://www.healthcare.gov" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1400/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.healthcare.gov" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-snap-application", name: "Louisiana SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://cafe-cp.dcfs.la.gov" },
    ],
  },
  {
    id: "adult-day-health-care-waiver",
    name: "Adult Day Health Care Waiver",
    shortName: "Adult Day Health Care Waiver",
    tagline: "Medicaid HCBS waiver providing adult day health care services to prevent nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing adult day health care services to prevent nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-medicaid-application", name: "Louisiana Medicaid Application", description: "Official Louisiana Medicaid application, required for waiver enrollment.", url: "https://www.healthcare.gov" },
      { id: "louisiana-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.healthcare.gov" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low-Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Assists eligible low-income households with heating and cooling bills and energy crisis assistance.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income households with heating and cooling bills and energy crisis assistance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2794/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-energy-application", name: "Louisiana Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.doa.la.gov/doa/lcle/liheap/" },
    ],
  },
  {
    id: "louisiana-senior-health-insurance-information-program-la-shi",
    name: "Louisiana Senior Health Insurance Information Program (LA SHIP)",
    shortName: "LA SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries and caregivers on Medicare options and enrollment.",
    savingsRange: "Free counseling service",
    description: "Free counseling and assistance for Medicare beneficiaries and caregivers on Medicare options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "home-delivered-meals-nutrition-program",
    name: "Home-Delivered Meals (Nutrition Program)",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors through Area Agencies on Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors through Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2794/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of individuals 60+ including respite care and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of individuals 60+ including respite care and counseling.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2794/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "louisiana-legal-services",
    name: "Louisiana Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors for issues like benefits, housing, and consumer rights.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors for issues like benefits, housing, and consumer rights.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1920/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "louisiana-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Maine ───────────────────────────────────────────────────────────────────────

const mainePrograms: WaiverProgram[] = [
  {
    id: "mainecare-aged-blind-and-disabled",
    name: "MaineCare Aged, Blind, and Disabled",
    shortName: "MaineCare Aged, Blind, and",
    tagline: "MaineCare is Maine's Medicaid program providing health coverage for seniors aged 65+ with limited income.",
    savingsRange: "$1,000 – $5,000/year",
    description: "MaineCare is Maine's Medicaid program providing health coverage for seniors aged 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-medicaid-application", name: "Maine Medicaid Application", description: "Official Maine Medicaid application. Apply online or download a printable form.", url: "https://www.mymaineconnection.gov" },
    ],
  },
  {
    id: "mainecare-elderly-and-adults-with-disabilities-waiver",
    name: "MaineCare Elderly and Adults with Disabilities Waiver",
    shortName: "MaineCare Elderly and Adults",
    tagline: "This HCBS Medicaid waiver provides home-based long-term care services for seniors 65+ at risk of nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "This HCBS Medicaid waiver provides home-based long-term care services for seniors 65+ at risk of nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-medicaid-application", name: "Maine Medicaid Application", description: "Official Maine Medicaid application, required for waiver enrollment.", url: "https://www.mymaineconnection.gov" },
      { id: "maine-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.mymaineconnection.gov" },
    ],
  },
  {
    id: "mainecare-medicare-savings-programs",
    name: "MaineCare Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Maine's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Maine's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2413/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.mymaineconnection.gov" },
    ],
  },
  {
    id: "maine-snap",
    name: "Maine SNAP",
    shortName: "SNAP/Food",
    tagline: "Maine's SNAP provides monthly benefits via EBT card to low-income seniors for purchasing nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Maine's SNAP provides monthly benefits via EBT card to low-income seniors for purchasing nutritious food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-snap-application", name: "Maine SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.mymaineconnection.gov" },
    ],
  },
  {
    id: "maine-senior-health-insurance-assistance-program-ship",
    name: "Maine Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Maine SHIP offers free, unbiased counseling on Medicare, Medicare Savings Programs, and coverage options.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Maine SHIP offers free, unbiased counseling on Medicare, Medicare Savings Programs, and coverage options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "maine-heating-assistance-liheap",
    name: "Maine Heating Assistance / LIHEAP",
    shortName: "Energy Assistance",
    tagline: "Maine's LIHEAP helps low-income households, including seniors, pay heating costs in winter months.",
    savingsRange: "$500 – $2,000/year",
    description: "Maine's LIHEAP helps low-income households, including seniors, pay heating costs in winter months.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-energy-application", name: "Maine Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.mainehousing.org/programs-services/energy/energy-home" },
    ],
  },
  {
    id: "maine-state-ssi-supplement",
    name: "Maine State SSI Supplement",
    shortName: "SSI Supplement",
    tagline: "Maine provides a small monthly SSI state supplement to eligible SSI recipients who are aged, blind, or disabled.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Maine provides a small monthly SSI state supplement to eligible SSI recipients who are aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $943/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "maine-ssi-supplement", name: "Maine SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.mymaineconnection.gov" },
    ],
  },
  {
    id: "maine-long-term-care-ombudsman-program",
    name: "Maine Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "The Ombudsman Program advocates for residents of long-term care facilities, investigating complaints.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The Ombudsman Program advocates for residents of long-term care facilities, investigating complaints.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "maine-property-tax-stabilization-for-seniors",
    name: "Maine Property Tax Stabilization for Seniors",
    shortName: "Property Tax Relief",
    tagline: "Provides property tax stabilization for eligible seniors and disabled homeowners, freezing assessments.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides property tax stabilization for eligible seniors and disabled homeowners, freezing assessments.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $40000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-property-tax-application", name: "Maine Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.mymaineconnection.gov" },
    ],
  },
  {
    id: "maine-home-delivered-meals",
    name: "Maine Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors through Area Agencies on Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors through Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-services-for-maine-s-elders",
    name: "Legal Services for Maine's Elders",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to Mainers aged 60+ on issues like benefits, housing, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to Mainers aged 60+ on issues like benefits, housing, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "maine-family-caregiver-support-program",
    name: "Maine Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support to family caregivers of seniors 60+, including respite care, counseling, and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support to family caregivers of seniors 60+, including respite care, counseling, and training.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maine-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Maryland ────────────────────────────────────────────────────────────────────

const marylandPrograms: WaiverProgram[] = [
  {
    id: "maryland-medical-assistance-regular-medicaid-abd",
    name: "Maryland Medical Assistance - Regular Medicaid/ABD",
    shortName: "Maryland Medical Assistance -",
    tagline: "State Medicaid program providing health coverage and limited long-term care services for seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "State Medicaid program providing health coverage and limited long-term care services for seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maryland-medicaid-application", name: "Maryland Medicaid Application", description: "Official Maryland Medicaid application. Apply online or download a printable form.", url: "https://www.marylandhealthconnection.gov" },
    ],
  },
  {
    id: "maryland-medical-assistance-nursing-home-medicaid",
    name: "Maryland Medical Assistance - Nursing Home Medicaid",
    shortName: "Maryland Medical Assistance -",
    tagline: "Medicaid coverage for nursing home care and related long-term care services for eligible seniors.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Medicaid coverage for nursing home care and related long-term care services for eligible seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maryland-medicaid-application", name: "Maryland Medicaid Application", description: "Official Maryland Medicaid application. Apply online or download a printable form.", url: "https://www.marylandhealthconnection.gov" },
    ],
  },
  {
    id: "maryland-medical-assistance-medically-needy-pathway",
    name: "Maryland Medical Assistance - Medically Needy Pathway",
    shortName: "Maryland Medical Assistance -",
    tagline: "ABD spenddown program allowing seniors over Medicaid income limits to become eligible by spending down income.",
    savingsRange: "$3,000 – $10,000/year",
    description: "ABD spenddown program allowing seniors over Medicaid income limits to become eligible by spending down income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maryland-medicaid-application", name: "Maryland Medicaid Application", description: "Official Maryland Medicaid application. Apply online or download a printable form.", url: "https://www.marylandhealthconnection.gov" },
    ],
  },
  {
    id: "maryland-hcbs-waivers-medicaid-waiver-programs",
    name: "Maryland HCBS Waivers - Medicaid Waiver Programs",
    shortName: "Maryland HCBS Waivers -",
    tagline: "Home and community-based services Medicaid waivers providing alternatives to institutional care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waivers providing alternatives to institutional care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maryland-medicaid-application", name: "Maryland Medicaid Application", description: "Official Maryland Medicaid application, required for waiver enrollment.", url: "https://www.marylandhealthconnection.gov" },
      { id: "maryland-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.marylandhealthconnection.gov" },
    ],
  },
  {
    id: "maryland-eid-program-employed-individuals-with-disabilities",
    name: "Maryland EID Program - Employed Individuals with Disabilities",
    shortName: "Maryland EID Program -",
    tagline: "Medicaid buy-in program for workers with disabilities who would otherwise be ineligible.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Medicaid buy-in program for workers with disabilities who would otherwise be ineligible.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "maryland-medicaid-application", name: "Maryland Medicaid Application", description: "Official Maryland Medicaid application. Apply online or download a printable form.", url: "https://www.marylandhealthconnection.gov" },
    ],
  },
];

// ─── Massachusetts ───────────────────────────────────────────────────────────────

const massachusettsPrograms: WaiverProgram[] = [
  {
    id: "masshealth-standard-aged-blind-and-disabled-medicaid",
    name: "MassHealth Standard (Aged, Blind, and Disabled Medicaid)",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare coverage and long-term care services to financially limited seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to financially limited seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-medicaid-application", name: "Massachusetts Medicaid Application", description: "Official Massachusetts Medicaid application. Apply online or download a printable form.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "frail-elder-waiver-few",
    name: "Frail Elder Waiver (FEW)",
    shortName: "FEW",
    tagline: "Medicaid HCBS waiver providing long-term care services to seniors aged 60+ requiring nursing-level care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing long-term care services to seniors aged 60+ requiring nursing-level care.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-medicaid-application", name: "Massachusetts Medicaid Application", description: "Official Massachusetts Medicaid application, required for waiver enrollment.", url: "https://www.mahealthconnector.org" },
      { id: "massachusetts-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "masshealth-buy-in-qmb-slmb-qi",
    name: "MassHealth Buy-In (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State-administered programs helping low-income Medicare beneficiaries pay Medicare costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs helping low-income Medicare beneficiaries pay Medicare costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2174/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-snap-application", name: "Massachusetts SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dtaconnect.eohhs.mass.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Comprehensive healthcare and long-term care program for dual-eligible seniors 55+ needing nursing-level care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Comprehensive healthcare and long-term care program for dual-eligible seniors 55+ needing nursing-level care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1305/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.mahealthconnector.org" },
      { id: "massachusetts-medicaid-application", name: "Massachusetts Medicaid Application", description: "Medicaid eligibility may be required. Apply through Massachusetts's portal.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Provides financial assistance to help eligible low-income households, including seniors, pay energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides financial assistance to help eligible low-income households, including seniors, pay energy bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3838/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-energy-application", name: "Massachusetts Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.mass.gov/info-details/how-to-apply-for-fuel-assistance" },
    ],
  },
  {
    id: "masshealth-senior-pharmacy-program-spap",
    name: "MassHealth Senior Pharmacy Program (SPAP)",
    shortName: "SPAP",
    tagline: "State Pharmaceutical Assistance Program providing copayment assistance for prescription medications.",
    savingsRange: "$1,000 – $5,000/year",
    description: "State Pharmaceutical Assistance Program providing copayment assistance for prescription medications.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-pharmacy-application", name: "Massachusetts Prescription Assistance Application", description: "Apply for state pharmaceutical assistance to help cover prescription drug costs.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "ship-state-health-insurance-assistance-program",
    name: "SHIP (State Health Insurance Assistance Program)",
    shortName: "SHIP (State Health Insurance",
    tagline: "Provides free, unbiased counseling on Medicare options, including Parts A/B/D and supplemental plans.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides free, unbiased counseling on Medicare options, including Parts A/B/D and supplemental plans.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "clause-41c-senior-circuit-breaker-tax-credit",
    name: "Clause 41C Senior Circuit Breaker Tax Credit",
    shortName: "Clause 41C Senior Circuit",
    tagline: "Property tax relief providing refundable income tax credit to seniors with high property tax burdens.",
    savingsRange: "$500 – $2,500/year",
    description: "Property tax relief providing refundable income tax credit to seniors with high property tax burdens.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $66000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-property-tax-application", name: "Massachusetts Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for rights and resolves complaints for residents in long-term care facilities.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for rights and resolves complaints for residents in long-term care facilities.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "state-supplement-to-ssi",
    name: "State Supplement to SSI",
    shortName: "State Supplement to SSI",
    tagline: "Massachusetts provides cash supplement to federal SSI for aged, blind, and disabled individuals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Massachusetts provides cash supplement to federal SSI for aged, blind, and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1086/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "massachusetts-ssi-supplement", name: "Massachusetts SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.mahealthconnector.org" },
    ],
  },
  {
    id: "home-delivered-meals-via-elder-affairs-nutrition-program",
    name: "Home-Delivered Meals via Elder Affairs Nutrition Program",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors to promote health and independence.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors to promote health and independence.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2174/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-services-for-elders-via-elder-law-projects",
    name: "Legal Services for Elders via Elder Law Projects",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors on issues like housing, benefits, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors on issues like housing, benefits, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2174/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, counseling, training, and supplemental services for caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, counseling, training, and supplemental services for caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3838/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "massachusetts-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Michigan ────────────────────────────────────────────────────────────────────

const michiganPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-and-disabled",
    name: "Medicaid for Aged and Disabled",
    shortName: "ABD Medicaid",
    tagline: "Provides medical assistance to low-income seniors aged 65+ who are aged, blind, or disabled.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides medical assistance to low-income seniors aged 65+ who are aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-medicaid-application", name: "Michigan Medicaid Application", description: "Official Michigan Medicaid application. Apply online or download a printable form.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "mi-choice-waiver-program",
    name: "MI Choice Waiver Program",
    shortName: "MI Choice Waiver Program",
    tagline: "Medicaid waiver providing home and community-based services to seniors needing nursing home level of care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver providing home and community-based services to seniors needing nursing home level of care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-medicaid-application", name: "Michigan Medicaid Application", description: "Official Michigan Medicaid application, required for waiver enrollment.", url: "https://newmibridges.michigan.gov" },
      { id: "michigan-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "medicare-savings-program",
    name: "Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "food-assistance-program",
    name: "Food Assistance Program",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits to low-income seniors to purchase food via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits to low-income seniors to purchase food via EBT card.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1763/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-snap-application", name: "Michigan SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "michigan-pace",
    name: "Michigan PACE",
    shortName: "Michigan PACE",
    tagline: "Program of All-Inclusive Care for the Elderly provides comprehensive medical and social services.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Program of All-Inclusive Care for the Elderly provides comprehensive medical and social services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://newmibridges.michigan.gov" },
      { id: "michigan-medicaid-application", name: "Michigan Medicaid Application", description: "Medicaid eligibility may be required. Apply through Michigan's portal.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "michigan-ship",
    name: "Michigan SHIP",
    shortName: "Michigan SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on options, enrollment, and appeals.",
    savingsRange: "Free counseling service",
    description: "Free counseling and assistance for Medicare beneficiaries on options, enrollment, and appeals.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "state-emergency-relief",
    name: "State Emergency Relief",
    shortName: "State Emergency Relief",
    tagline: "Provides one-time assistance for energy bills, home repairs, and utility needs for low-income seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Provides one-time assistance for energy bills, home repairs, and utility needs for low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1763/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-medicaid-application", name: "Michigan Medicaid Application", description: "Official Michigan Medicaid application. Apply online or download a printable form.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services to family caregivers of seniors, including respite care, counseling, and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services to family caregivers of seniors, including respite care, counseling, and training.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1763/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "property-tax-credit-for-seniors",
    name: "Property Tax Credit for Seniors",
    shortName: "Property Tax Relief",
    tagline: "Provides income-based credit on homestead property taxes or rent for seniors to reduce housing costs.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides income-based credit on homestead property taxes or rent for seniors to reduce housing costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1763/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-property-tax-application", name: "Michigan Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities, resolving complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities, resolving complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors to promote health and independence.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors to promote health and independence.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1763/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "state-ssi-supplement",
    name: "State SSI Supplement",
    shortName: "SSI Supplement",
    tagline: "Michigan provides a small state supplement to federal SSI for aged, blind, and disabled individuals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Michigan provides a small state supplement to federal SSI for aged, blind, and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $794/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "michigan-ssi-supplement", name: "Michigan SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://newmibridges.michigan.gov" },
    ],
  },
  {
    id: "area-agency-on-aging-legal-services",
    name: "Area Agency on Aging Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free or low-cost legal assistance to seniors on issues like housing, benefits, and consumer rights.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free or low-cost legal assistance to seniors on issues like housing, benefits, and consumer rights.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1763/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "michigan-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Minnesota ───────────────────────────────────────────────────────────────────

const minnesotaPrograms: WaiverProgram[] = [
  {
    id: "medical-assistance-ma-for-elderly-blind-and-disabled",
    name: "Medical Assistance (MA) for Elderly, Blind, and Disabled",
    shortName: "MA",
    tagline: "Minnesota's Medicaid program provides health coverage for seniors 65+ with limited income.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Minnesota's Medicaid program provides health coverage for seniors 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-medicaid-application", name: "Minnesota Medicaid Application", description: "Official Minnesota Medicaid application. Apply online or download a printable form.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "elderly-waiver-ew",
    name: "Elderly Waiver (EW)",
    shortName: "EW",
    tagline: "Minnesota's HCBS Medicaid waiver providing long-term services to seniors 65+ at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Minnesota's HCBS Medicaid waiver providing long-term services to seniors 65+ at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-medicaid-application", name: "Minnesota Medicaid Application", description: "Official Minnesota Medicaid application, required for waiver enrollment.", url: "https://mnbenefits.mn.gov" },
      { id: "minnesota-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Minnesota's Medicare Savings Programs help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Minnesota's Medicare Savings Programs help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "minnesota-supplemental-nutrition-assistance-program-snap",
    name: "Minnesota Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Minnesota SNAP provides monthly benefits to low-income seniors to buy healthy food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Minnesota SNAP provides monthly benefits to low-income seniors to buy healthy food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-snap-application", name: "Minnesota SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Minnesota offers PACE programs providing comprehensive medical and social services to frail seniors.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Minnesota offers PACE programs providing comprehensive medical and social services to frail seniors.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://mnbenefits.mn.gov" },
      { id: "minnesota-medicaid-application", name: "Minnesota Medicaid Application", description: "Medicaid eligibility may be required. Apply through Minnesota's portal.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "senior-health-insurance-assistance-program-ship",
    name: "Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "SHIP offers free, unbiased counseling to Medicare beneficiaries on coverage options and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "SHIP offers free, unbiased counseling to Medicare beneficiaries on coverage options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "minnesota-supplemental-aid-msa",
    name: "Minnesota Supplemental Aid (MSA)",
    shortName: "MSA",
    tagline: "State SSI supplement provides cash assistance to aged, blind, and disabled SSI recipients.",
    savingsRange: "$1,000 – $5,000/year",
    description: "State SSI supplement provides cash assistance to aged, blind, and disabled SSI recipients.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $943/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-medicaid-application", name: "Minnesota Medicaid Application", description: "Official Minnesota Medicaid application. Apply online or download a printable form.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "LIHEAP provides grants to help eligible low-income seniors pay heating and electric bills.",
    savingsRange: "$500 – $2,000/year",
    description: "LIHEAP provides grants to help eligible low-income seniors pay heating and electric bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2829/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-energy-application", name: "Minnesota Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://mn.gov/commerce/consumers/consumer-assistance/energy-assistance/" },
    ],
  },
  {
    id: "minnesota-property-tax-refund-ptf-for-seniors",
    name: "Minnesota Property Tax Refund (PTF) for Seniors",
    shortName: "PTF",
    tagline: "Provides refunds to seniors 65+ and disabled homeowners/renters based on property taxes or rent paid.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides refunds to seniors 65+ and disabled homeowners/renters based on property taxes or rent paid.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $65000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-property-tax-application", name: "Minnesota Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://mnbenefits.mn.gov" },
    ],
  },
  {
    id: "minnesota-long-term-care-ombudsman-program",
    name: "Minnesota Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "The Long-Term Care Ombudsman advocates for residents in nursing homes and assisted living facilities.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The Long-Term Care Ombudsman advocates for residents in nursing homes and assisted living facilities.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "senior-nutrition-home-delivered-meals",
    name: "Senior Nutrition Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Home-delivered meals program provides nutritious meals to homebound seniors 60+.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Home-delivered meals program provides nutritious meals to homebound seniors 60+.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2829/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of seniors 60+ including respite care and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors 60+ including respite care and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2829/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "senior-legal-helpline",
    name: "Senior Legal Helpline",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal advice and brief services to low-income seniors 60+ on public benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal advice and brief services to low-income seniors 60+ on public benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2798/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "minnesota-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Mississippi ─────────────────────────────────────────────────────────────────

const mississippiPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare coverage and long-term care services to Mississippi seniors aged 65+ with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to Mississippi seniors aged 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-medicaid-application", name: "Mississippi Medicaid Application", description: "Official Mississippi Medicaid application. Apply online or download a printable form.", url: "https://www.medicaid.ms.gov/apply/" },
    ],
  },
  {
    id: "elderly-and-disabled-waiver",
    name: "Elderly and Disabled Waiver",
    shortName: "Elderly and Disabled Waiver",
    tagline: "Medicaid HCBS waiver providing home and community-based services to seniors 65+ at risk of nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing home and community-based services to seniors 65+ at risk of nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-medicaid-application", name: "Mississippi Medicaid Application", description: "Official Mississippi Medicaid application, required for waiver enrollment.", url: "https://www.medicaid.ms.gov/apply/" },
      { id: "mississippi-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.medicaid.ms.gov/apply/" },
    ],
  },
  {
    id: "medicare-savings-program",
    name: "Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.medicaid.ms.gov/apply/" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits to low-income seniors to purchase nutritious food via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits to low-income seniors to purchase nutritious food via EBT card.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1981/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-snap-application", name: "Mississippi SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.mdhs.ms.gov/economic-assistance/snap/" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Assists low-income households, including seniors, with heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists low-income households, including seniors, with heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2783/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-energy-application", name: "Mississippi Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.mdhs.ms.gov/economic-assistance/liheap/" },
    ],
  },
  {
    id: "mississippi-ship-state-health-insurance-assistance-program",
    name: "Mississippi SHIP (State Health Insurance Assistance Program)",
    shortName: "Mississippi SHIP (State",
    tagline: "Offers free, unbiased counseling and assistance to Medicare beneficiaries on Medicare options and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Offers free, unbiased counseling and assistance to Medicare beneficiaries on Medicare options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "mississippi-home-delivered-meals",
    name: "Mississippi Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors through Nutrition Services of the Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors through Nutrition Services of the Aging.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2783/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of seniors 60+, including respite care and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors 60+, including respite care and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2783/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "mississippi-long-term-care-ombudsman-program",
    name: "Mississippi Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "mississippi-legal-services-senior-program",
    name: "Mississippi Legal Services Senior Program",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors on issues like housing, benefits, and elder abuse.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides free legal assistance to low-income seniors on issues like housing, benefits, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2783/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "mississippi-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Missouri ────────────────────────────────────────────────────────────────────

const missouriPrograms: WaiverProgram[] = [
  {
    id: "mo-healthnet-for-the-aged-blind-and-disabled-abd",
    name: "MO HealthNet for the Aged, Blind, and Disabled (ABD)",
    shortName: "ABD",
    tagline: "Provides Medicaid coverage for personal care and community-based services to seniors aged 65+ with limited income.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Provides Medicaid coverage for personal care and community-based services to seniors aged 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1109/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-medicaid-application", name: "Missouri Medicaid Application", description: "Official Missouri Medicaid application. Apply online or download a printable form.", url: "https://mydss.mo.gov" },
    ],
  },
  {
    id: "aged-and-disabled-waiver-adw",
    name: "Aged and Disabled Waiver (ADW)",
    shortName: "ADW",
    tagline: "Medicaid HCBS waiver providing in-home services like homemaker, chore, respite, and adult day care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid HCBS waiver providing in-home services like homemaker, chore, respite, and adult day care.",
    eligibilityHighlights: [
      "Age 63 or older",
      "Income below $1690/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-medicaid-application", name: "Missouri Medicaid Application", description: "Official Missouri Medicaid application, required for waiver enrollment.", url: "https://mydss.mo.gov" },
      { id: "missouri-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://mydss.mo.gov" },
    ],
  },
  {
    id: "mo-healthnet-medicare-savings-programs",
    name: "MO HealthNet Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1407/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://mydss.mo.gov" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via EBT card to purchase food for eligible low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase food for eligible low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1992/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-snap-application", name: "Missouri SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://mydss.mo.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Provides comprehensive medical and social services to frail seniors 55+ certified for nursing home level of care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Provides comprehensive medical and social services to frail seniors 55+ certified for nursing home level of care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1690/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://mydss.mo.gov" },
      { id: "missouri-medicaid-application", name: "Missouri Medicaid Application", description: "Medicaid eligibility may be required. Apply through Missouri's portal.", url: "https://mydss.mo.gov" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Provides financial assistance to help eligible low-income households, including seniors, pay energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides financial assistance to help eligible low-income households, including seniors, pay energy bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-energy-application", name: "Missouri Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://mydss.mo.gov/utility-assistance" },
    ],
  },
  {
    id: "missouri-connecting-to-medicare-ship",
    name: "Missouri Connecting to Medicare (SHIP)",
    shortName: "SHIP",
    tagline: "State Health Insurance Assistance Program providing free, unbiased counseling on Medicare options.",
    savingsRange: "Free counseling service",
    description: "State Health Insurance Assistance Program providing free, unbiased counseling on Medicare options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "missouri-property-tax-credit",
    name: "Missouri Property Tax Credit",
    shortName: "Property Tax Relief",
    tagline: "Provides tax credits to seniors 65+ and disabled homeowners/renters with income below limits.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides tax credits to seniors 65+ and disabled homeowners/renters with income below limits.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $30000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-property-tax-application", name: "Missouri Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://mydss.mo.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and resolving issues.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and resolving issues.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "senior-home-delivered-meals",
    name: "Senior Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors 60+ who are unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors 60+ who are unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1690/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services including respite care, counseling, training, and supplemental services for caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services including respite care, counseling, training, and supplemental services for caregivers.",
    eligibilityHighlights: [
      "Age 70 or older",
      "Income below $36000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "missouri-legal-services-for-seniors",
    name: "Missouri Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and consumer rights.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on issues like benefits, housing, and consumer rights.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1875/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "missouri-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Montana ─────────────────────────────────────────────────────────────────────

const montanaPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-blind-or-disabled",
    name: "Medicaid for Aged, Blind, or Disabled",
    shortName: "ABD Medicaid",
    tagline: "Montana's Medicaid program for seniors 65+ and disabled individuals who meet Social Security criteria.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Montana's Medicaid program for seniors 65+ and disabled individuals who meet Social Security criteria.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "montana-medicaid-application", name: "Montana Medicaid Application", description: "Official Montana Medicaid application. Apply online or download a printable form.", url: "https://apply.mt.gov" },
    ],
  },
  {
    id: "big-sky-waiver-program",
    name: "Big Sky Waiver Program",
    shortName: "Big Sky Waiver Program",
    tagline: "Montana's 1915(c) HCBS Medicaid waiver for elderly (65+) or disabled residents at risk of nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Montana's 1915(c) HCBS Medicaid waiver for elderly (65+) or disabled residents at risk of nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "montana-medicaid-application", name: "Montana Medicaid Application", description: "Official Montana Medicaid application, required for waiver enrollment.", url: "https://apply.mt.gov" },
      { id: "montana-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://apply.mt.gov" },
    ],
  },
  {
    id: "montana-medicaid-for-workers-with-disabilities",
    name: "Montana Medicaid for Workers with Disabilities",
    shortName: "Montana Medicaid for Workers",
    tagline: "Allows individuals who meet Social Security's disability criteria to receive Medicaid while working.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Allows individuals who meet Social Security's disability criteria to receive Medicaid while working.",
    eligibilityHighlights: [
      "Age 18 or older",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "montana-medicaid-application", name: "Montana Medicaid Application", description: "Official Montana Medicaid application. Apply online or download a printable form.", url: "https://apply.mt.gov" },
    ],
  },
];

// ─── Nebraska ────────────────────────────────────────────────────────────────────

const nebraskaPrograms: WaiverProgram[] = [
  {
    id: "nebraska-medicaid-aged-and-disabled-waiver",
    name: "Nebraska Medicaid Aged and Disabled Waiver",
    shortName: "ABD Medicaid",
    tagline: "Statewide Medicaid HCBS waiver for seniors 65+ or disabled individuals at risk of nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Statewide Medicaid HCBS waiver for seniors 65+ or disabled individuals at risk of nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-medicaid-application", name: "Nebraska Medicaid Application", description: "Official Nebraska Medicaid application, required for waiver enrollment.", url: "https://dhhs.ne.gov/Pages/Medicaid-Applications.aspx" },
      { id: "nebraska-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dhhs.ne.gov/Pages/Medicaid-Applications.aspx" },
    ],
  },
  {
    id: "nebraska-aged-and-disabled-waiver-hcbs",
    name: "Nebraska Aged and Disabled Waiver HCBS",
    shortName: "Nebraska Aged and Disabled",
    tagline: "The primary HCBS waiver providing home and community-based care services for elderly and disabled residents.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The primary HCBS waiver providing home and community-based care services for elderly and disabled residents.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-medicaid-application", name: "Nebraska Medicaid Application", description: "Official Nebraska Medicaid application, required for waiver enrollment.", url: "https://dhhs.ne.gov/Pages/Medicaid-Applications.aspx" },
      { id: "nebraska-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dhhs.ne.gov/Pages/Medicaid-Applications.aspx" },
    ],
  },
  {
    id: "nebraska-medicare-savings-programs",
    name: "Nebraska Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries pay costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://dhhs.ne.gov/Pages/Medicaid-Applications.aspx" },
    ],
  },
  {
    id: "nebraska-supplemental-nutrition-assistance-program-snap",
    name: "Nebraska Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits via EBT card to purchase food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase food for low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1982/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-snap-application", name: "Nebraska SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dhhs.ne.gov/Pages/SNAP.aspx" },
    ],
  },
  {
    id: "nebraska-senior-health-insurance-assistance-ship",
    name: "Nebraska Senior Health Insurance Assistance (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on coverage options and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries on coverage options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "nebraska-family-caregiver-support-program",
    name: "Nebraska Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services for family caregivers of seniors 60+, including respite care and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services for family caregivers of seniors 60+, including respite care and training.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3675/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "nebraska-low-income-home-energy-assistance-program-liheap",
    name: "Nebraska Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists low-income households, including seniors, with heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists low-income households, including seniors, with heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2794/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-energy-application", name: "Nebraska Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dhhs.ne.gov/Pages/Energy-Assistance.aspx" },
    ],
  },
  {
    id: "nebraska-long-term-care-ombudsman-program",
    name: "Nebraska Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and ensuring quality care.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "nebraska-home-delivered-meals-through-aging-services",
    name: "Nebraska Home-Delivered Meals through Aging Services",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "nebraska-legal-aid-for-seniors",
    name: "Nebraska Legal Aid for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal services to low-income seniors on issues like housing, benefits, and consumer rights.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal services to low-income seniors on issues like housing, benefits, and consumer rights.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nebraska-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Nevada ──────────────────────────────────────────────────────────────────────

const nevadaPrograms: WaiverProgram[] = [
  {
    id: "medical-assistance-to-the-aged-blind-and-disabled-maabd",
    name: "Medical Assistance to the Aged, Blind, and Disabled (MAABD)",
    shortName: "MAABD",
    tagline: "Provides healthcare and long-term care services to low-income Nevada residents aged 65+.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides healthcare and long-term care services to low-income Nevada residents aged 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-medicaid-application", name: "Nevada Medicaid Application", description: "Official Nevada Medicaid application. Apply online or download a printable form.", url: "https://dwss.nv.gov/Medical/Apply/" },
    ],
  },
  {
    id: "home-and-community-based-services-hcbs-frail-elderly-waiver",
    name: "Home and Community-Based Services (HCBS) Frail Elderly Waiver",
    shortName: "HCBS",
    tagline: "Medicaid waiver providing home and community-based services to prevent nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver providing home and community-based services to prevent nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-medicaid-application", name: "Nevada Medicaid Application", description: "Official Nevada Medicaid application, required for waiver enrollment.", url: "https://dwss.nv.gov/Medical/Apply/" },
      { id: "nevada-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dwss.nv.gov/Medical/Apply/" },
    ],
  },
  {
    id: "medicare-savings-programs-qmb-slmb-qi",
    name: "Medicare Savings Programs (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State-administered programs that help low-income Medicare beneficiaries pay premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs that help low-income Medicare beneficiaries pay premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://dwss.nv.gov/Medical/Apply/" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides food assistance benefits to low-income seniors to purchase nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides food assistance benefits to low-income seniors to purchase nutritious food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1952/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-snap-application", name: "Nevada SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dwss.nv.gov/SNAP/" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Comprehensive program coordinating medical, social, and long-term care for nursing-home-eligible seniors.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Comprehensive program coordinating medical, social, and long-term care for nursing-home-eligible seniors.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2901/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://dwss.nv.gov/Medical/Apply/" },
      { id: "nevada-medicaid-application", name: "Nevada Medicaid Application", description: "Medicaid eligibility may be required. Apply through Nevada's portal.", url: "https://dwss.nv.gov/Medical/Apply/" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Helps eligible low-income households, including seniors, pay heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps eligible low-income households, including seniors, pay heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-energy-application", name: "Nevada Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dwss.nv.gov/Energy/" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of seniors 60+ including respite care and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of seniors 60+ including respite care and training.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "nevada-senior-medicare-patrol-ship",
    name: "Nevada Senior Medicare Patrol (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on understanding coverage and enrollment.",
    savingsRange: "Free counseling service",
    description: "Free counseling and assistance for Medicare beneficiaries on understanding coverage and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "nevada-long-term-care-ombudsman-program",
    name: "Nevada Long Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "Free advocacy service",
    description: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals-nevada-senior-services",
    name: "Home-Delivered Meals (Nevada Senior Services)",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "nevada-legal-services-for-seniors",
    name: "Nevada Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on issues like housing, benefits, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on issues like housing, benefits, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "nevada-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── New Hampshire ───────────────────────────────────────────────────────────────

const newHampshirePrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-disabled",
    name: "Medicaid for Aged/Disabled",
    shortName: "ABD Medicaid",
    tagline: "New Hampshire's Medicaid program provides health coverage for low-income seniors aged 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "New Hampshire's Medicaid program provides health coverage for low-income seniors aged 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-medicaid-application", name: "New Hampshire Medicaid Application", description: "Official New Hampshire Medicaid application. Apply online or download a printable form.", url: "https://nheasy.nh.gov" },
    ],
  },
  {
    id: "choices-for-independence-waiver",
    name: "Choices for Independence Waiver",
    shortName: "Choices for Independence",
    tagline: "The Choices for Independence HCBS Waiver provides home and community-based services for seniors 65+.",
    savingsRange: "$10,000 – $30,000/year",
    description: "The Choices for Independence HCBS Waiver provides home and community-based services for seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-medicaid-application", name: "New Hampshire Medicaid Application", description: "Official New Hampshire Medicaid application, required for waiver enrollment.", url: "https://nheasy.nh.gov" },
      { id: "new-hampshire-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://nheasy.nh.gov" },
    ],
  },
  {
    id: "medicare-savings-program",
    name: "Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "New Hampshire's Medicare Savings Programs (QMB, SLMB, QI) assist low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "New Hampshire's Medicare Savings Programs (QMB, SLMB, QI) assist low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://nheasy.nh.gov" },
    ],
  },
  {
    id: "snap-nutrition-assistance",
    name: "SNAP Nutrition Assistance",
    shortName: "SNAP/Food",
    tagline: "New Hampshire's SNAP provides monthly benefits to low-income seniors for purchasing nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "New Hampshire's SNAP provides monthly benefits to low-income seniors for purchasing nutritious food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1920/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-snap-application", name: "New Hampshire SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://nheasy.nh.gov" },
    ],
  },
  {
    id: "liheap",
    name: "LIHEAP",
    shortName: "Energy Assistance",
    tagline: "New Hampshire's Low-Income Home Energy Assistance Program provides grants to help seniors pay energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "New Hampshire's Low-Income Home Energy Assistance Program provides grants to help seniors pay energy bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-energy-application", name: "New Hampshire Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.nh.gov/osi/energy/programs/fuel-assistance.htm" },
    ],
  },
  {
    id: "shine",
    name: "SHINE",
    shortName: "SHINE",
    tagline: "New Hampshire's SHINE program offers free, unbiased counseling on Medicare options and enrollment.",
    savingsRange: "Free counseling service",
    description: "New Hampshire's SHINE program offers free, unbiased counseling on Medicare options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "elderly-exemption-property-tax-credit",
    name: "Elderly Exemption Property Tax Credit",
    shortName: "Property Tax Relief",
    tagline: "New Hampshire's Elderly Exemption provides property tax credits or exemptions for seniors 65+.",
    savingsRange: "$500 – $2,500/year",
    description: "New Hampshire's Elderly Exemption provides property tax credits or exemptions for seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3750/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-property-tax-application", name: "New Hampshire Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://nheasy.nh.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "New Hampshire's Long-Term Care Ombudsman Program advocates for residents in nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "New Hampshire's Long-Term Care Ombudsman Program advocates for residents in nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home Delivered Meals",
    shortName: "Home Meals",
    tagline: "New Hampshire's Home Delivered Meals program provides nutritious meals to homebound seniors 60+.",
    savingsRange: "$1,500 – $3,600/year",
    description: "New Hampshire's Home Delivered Meals program provides nutritious meals to homebound seniors 60+.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "New Hampshire's Family Caregiver Support Program provides information, training, respite care, and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "New Hampshire's Family Caregiver Support Program provides information, training, respite care, and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-assistance-for-seniors",
    name: "Legal Assistance for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "New Hampshire's Legal Assistance for Seniors provides free civil legal services to low-income seniors 60+.",
    savingsRange: "$3,000 – $10,000/year",
    description: "New Hampshire's Legal Assistance for Seniors provides free civil legal services to low-income seniors 60+.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-hampshire-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── New Jersey ──────────────────────────────────────────────────────────────────

const newJerseyPrograms: WaiverProgram[] = [
  {
    id: "nj-familycare-aged-blind-disabled-abd-programs",
    name: "NJ FamilyCare Aged, Blind, Disabled (ABD) Programs",
    shortName: "ABD",
    tagline: "Provides medical coverage to individuals age 65+, blind, or disabled with limited income.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Provides medical coverage to individuals age 65+, blind, or disabled with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $998/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-medicaid-application", name: "New Jersey Medicaid Application", description: "Official New Jersey Medicaid application. Apply online or download a printable form.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "nj-familycare-managed-long-term-services-and-supports-mltss-",
    name: "NJ FamilyCare Managed Long Term Services and Supports (MLTSS) Waiver",
    shortName: "MLTSS",
    tagline: "Home and community-based services Medicaid waiver providing personal care assistance and support.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waiver providing personal care assistance and support.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-medicaid-application", name: "New Jersey Medicaid Application", description: "Official New Jersey Medicaid application, required for waiver enrollment.", url: "https://www.njfamilycare.org/default.aspx" },
      { id: "new-jersey-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "nj-familycare-medicare-savings-programs",
    name: "NJ FamilyCare Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1350/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "nj-snap-supplemental-nutrition-assistance-program",
    name: "NJ SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1990/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-snap-application", name: "New Jersey SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.njhelps.org" },
    ],
  },
  {
    id: "paad-pharmaceutical-assistance-to-the-aged-and-disabled",
    name: "PAAD (Pharmaceutical Assistance to the Aged and Disabled)",
    shortName: "PAAD (Pharmaceutical",
    tagline: "State Pharmaceutical Assistance Program providing prescription drug coverage to NJ seniors.",
    savingsRange: "$3,000 – $10,000/year",
    description: "State Pharmaceutical Assistance Program providing prescription drug coverage to NJ seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $31500/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-medicaid-application", name: "New Jersey Medicaid Application", description: "Official New Jersey Medicaid application. Apply online or download a printable form.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "nj-liheap-low-income-home-energy-assistance-program",
    name: "NJ LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Helps eligible low-income households, including seniors, pay heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps eligible low-income households, including seniors, pay heating and cooling bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2824/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-energy-application", name: "New Jersey Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.nj.gov/dca/divisions/dhcr/offices/liheap.html" },
    ],
  },
  {
    id: "new-jersey-pace-program-of-all-inclusive-care-for-the-elderl",
    name: "New Jersey PACE (Program of All-Inclusive Care for the Elderly)",
    shortName: "New Jersey PACE (Program of",
    tagline: "Offers comprehensive medical and social services to frail seniors 55+ eligible for nursing-level care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Offers comprehensive medical and social services to frail seniors 55+ eligible for nursing-level care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.njfamilycare.org/default.aspx" },
      { id: "new-jersey-medicaid-application", name: "New Jersey Medicaid Application", description: "Medicaid eligibility may be required. Apply through New Jersey's portal.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "new-jersey-ship-state-health-insurance-assistance-program",
    name: "New Jersey SHIP (State Health Insurance Assistance Program)",
    shortName: "New Jersey SHIP (State Health",
    tagline: "Provides free, unbiased counseling and enrollment assistance for Medicare beneficiaries.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides free, unbiased counseling and enrollment assistance for Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "new-jersey-senior-freeze-property-tax-reimbursement",
    name: "New Jersey Senior Freeze Property Tax Reimbursement",
    shortName: "Property Tax Relief",
    tagline: "Provides property tax relief through reimbursement for eligible seniors 65+ homeowners.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides property tax relief through reimbursement for eligible seniors 65+ homeowners.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $157000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-property-tax-application", name: "New Jersey Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "new-jersey-family-caregiver-support-program",
    name: "New Jersey Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including caregiver training, respite care, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including caregiver training, respite care, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $36000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "new-jersey-long-term-care-ombudsman-program",
    name: "New Jersey Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "new-jersey-home-delivered-meals",
    name: "New Jersey Home Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors 60+ unable to prepare food themselves.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors 60+ unable to prepare food themselves.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "new-jersey-ssi-state-supplement",
    name: "New Jersey SSI State Supplement",
    shortName: "New Jersey SSI State",
    tagline: "State supplement to federal SSI payments for aged, blind, and disabled recipients.",
    savingsRange: "$3,000 – $10,000/year",
    description: "State supplement to federal SSI payments for aged, blind, and disabled recipients.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $998/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "new-jersey-ssi-supplement", name: "New Jersey SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.njfamilycare.org/default.aspx" },
    ],
  },
  {
    id: "new-jersey-senior-legal-services",
    name: "New Jersey Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on issues like benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on issues like benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $30000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-jersey-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── New Mexico ──────────────────────────────────────────────────────────────────

const newMexicoPrograms: WaiverProgram[] = [
  {
    id: "centennial-care-aged-blind-and-disabled",
    name: "Centennial Care Aged, Blind, and Disabled",
    shortName: "Centennial Care Aged, Blind,",
    tagline: "New Mexico's Medicaid program for seniors aged 65+, blind, or disabled providing health and long-term care.",
    savingsRange: "$1,000 – $5,000/year",
    description: "New Mexico's Medicaid program for seniors aged 65+, blind, or disabled providing health and long-term care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-medicaid-application", name: "New Mexico Medicaid Application", description: "Official New Mexico Medicaid application. Apply online or download a printable form.", url: "https://www.yes.state.nm.us" },
    ],
  },
  {
    id: "qualified-medicare-beneficiary-qmb",
    name: "Qualified Medicare Beneficiary (QMB)",
    shortName: "QMB",
    tagline: "State-administered program paying Medicare Part A and B premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered program paying Medicare Part A and B premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.yes.state.nm.us" },
    ],
  },
  {
    id: "centennial-care-home-and-community-based-services-waiver",
    name: "Centennial Care Home and Community Based Services Waiver",
    shortName: "Centennial Care Home and",
    tagline: "Medicaid waiver programs providing institutional-level services at home and in the community.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver programs providing institutional-level services at home and in the community.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-medicaid-application", name: "New Mexico Medicaid Application", description: "Official New Mexico Medicaid application, required for waiver enrollment.", url: "https://www.yes.state.nm.us" },
      { id: "new-mexico-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.yes.state.nm.us" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for low-income seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-snap-application", name: "New Mexico SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.yes.state.nm.us" },
    ],
  },
  {
    id: "new-mexico-senior-health-insurance-assistance-program-ship",
    name: "New Mexico Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on plan choices, appeals, and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries on plan choices, appeals, and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "new-mexico-long-term-care-ombudsman-program",
    name: "New Mexico Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Helps eligible low-income households, including seniors, pay heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps eligible low-income households, including seniors, pay heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3090/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-energy-application", name: "New Mexico Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.hsd.state.nm.us/LookingForAssistance/Low-Income-Home-Energy-Assistance/" },
    ],
  },
  {
    id: "new-mexico-home-delivered-meals",
    name: "New Mexico Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious home-delivered meals to homebound seniors 60+ unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious home-delivered meals to homebound seniors 60+ unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "new-mexico-legal-aid-senior-services",
    name: "New Mexico Legal Aid Senior Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors 60+ on issues like housing and benefits.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors 60+ on issues like housing and benefits.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "new-mexico-family-caregiver-support-program",
    name: "New Mexico Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, counseling, and supplemental services.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, counseling, and supplemental services.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $36000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-mexico-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── New York ────────────────────────────────────────────────────────────────────

const newYorkPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-blind-and-disabled",
    name: "Medicaid for Aged, Blind and Disabled",
    shortName: "ABD Medicaid",
    tagline: "New York's Medicaid program for seniors 65+ and disabled individuals providing comprehensive health coverage.",
    savingsRange: "$5,000 – $20,000/year",
    description: "New York's Medicaid program for seniors 65+ and disabled individuals providing comprehensive health coverage.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-medicaid-application", name: "New York Medicaid Application", description: "Official New York Medicaid application. Apply online or download a printable form.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "medicare-savings-program-qmb-slmb-qi",
    name: "Medicare Savings Program (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State-administered program that helps pay Medicare premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered program that helps pay Medicare premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "New York's food assistance program providing monthly benefits to eligible seniors via EBT card.",
    savingsRange: "$1,500 – $3,600/year",
    description: "New York's food assistance program providing monthly benefits to eligible seniors via EBT card.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-snap-application", name: "New York SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://mybenefits.ny.gov" },
    ],
  },
  {
    id: "elderly-pharmaceutical-insurance-coverage-epic",
    name: "Elderly Pharmaceutical Insurance Coverage (EPIC)",
    shortName: "EPIC",
    tagline: "New York's State Pharmaceutical Assistance Program providing prescription drug cost-sharing assistance.",
    savingsRange: "$1,000 – $5,000/year",
    description: "New York's State Pharmaceutical Assistance Program providing prescription drug cost-sharing assistance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-pharmacy-application", name: "New York Prescription Assistance Application", description: "Apply for state pharmaceutical assistance to help cover prescription drug costs.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "home-and-community-based-services-hcbs-waiver",
    name: "Home and Community-Based Services (HCBS) Waiver",
    shortName: "HCBS",
    tagline: "Medicaid waiver program providing home care, personal care assistance, and adult day care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver program providing home care, personal care assistance, and adult day care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2433/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-medicaid-application", name: "New York Medicaid Application", description: "Official New York Medicaid application, required for waiver enrollment.", url: "https://nystateofhealth.ny.gov" },
      { id: "new-york-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "health-insurance-information-counseling-and-assistance-progr",
    name: "Health Insurance Information, Counseling and Assistance Program (HIICAP)",
    shortName: "HIICAP",
    tagline: "New York's State Health Insurance Assistance Program providing free, unbiased Medicare counseling.",
    savingsRange: "$3,000 – $10,000/year",
    description: "New York's State Health Insurance Assistance Program providing free, unbiased Medicare counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists eligible low-income seniors with heating and cooling costs and utility bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income seniors with heating and cooling costs and utility bills.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-energy-application", name: "New York Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://otda.ny.gov/programs/heap/" },
    ],
  },
  {
    id: "state-supplemental-security-income-ssi-supplement",
    name: "State Supplemental Security Income (SSI) Supplement",
    shortName: "SSI",
    tagline: "New York provides a state supplement to federal SSI benefits for eligible seniors and disabled individuals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "New York provides a state supplement to federal SSI benefits for eligible seniors and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "new-york-ssi-supplement", name: "New York SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Comprehensive care program for frail seniors 55+ that combines medical services and long-term care.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Comprehensive care program for frail seniors 55+ that combines medical services and long-term care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://nystateofhealth.ny.gov" },
      { id: "new-york-medicaid-application", name: "New York Medicaid Application", description: "Medicaid eligibility may be required. Apply through New York's portal.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in nursing homes, adult care facilities, and assisted living programs.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in nursing homes, adult care facilities, and assisted living programs.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "older-americans-act-nutrition-program-meals-on-wheels",
    name: "Older Americans Act Nutrition Program (Meals on Wheels)",
    shortName: "Home Meals",
    tagline: "Provides home-delivered meals and congregate dining services to seniors 60+.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides home-delivered meals and congregate dining services to seniors 60+.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "property-tax-relief-for-seniors",
    name: "Property Tax Relief for Seniors",
    shortName: "Property Tax Relief",
    tagline: "New York offers property tax exemptions and relief programs for seniors 65+ with limited income.",
    savingsRange: "$500 – $2,500/year",
    description: "New York offers property tax exemptions and relief programs for seniors 65+ with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-property-tax-application", name: "New York Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://nystateofhealth.ny.gov" },
    ],
  },
  {
    id: "senior-legal-services",
    name: "Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors on issues including housing, benefits, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors on issues including housing, benefits, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "caregiver-resource-center",
    name: "Caregiver Resource Center",
    shortName: "Caregiver Support",
    tagline: "Provides support services, training, and resources for family caregivers of seniors.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services, training, and resources for family caregivers of seniors.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "new-york-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── North Carolina ──────────────────────────────────────────────────────────────

const northCarolinaPrograms: WaiverProgram[] = [
  {
    id: "regular-medicaid-aged-blind-and-disabled",
    name: "Regular Medicaid / Aged Blind and Disabled",
    shortName: "ABD Medicaid",
    tagline: "North Carolina's Medicaid program for seniors aged 65+ and disabled individuals providing health coverage.",
    savingsRange: "$5,000 – $20,000/year",
    description: "North Carolina's Medicaid program for seniors aged 65+ and disabled individuals providing health coverage.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-medicaid-application", name: "North Carolina Medicaid Application", description: "Official North Carolina Medicaid application. Apply online or download a printable form.", url: "https://epass.nc.gov" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://epass.nc.gov" },
    ],
  },
  {
    id: "food-and-nutrition-services-snap",
    name: "Food and Nutrition Services (SNAP)",
    shortName: "SNAP",
    tagline: "North Carolina's SNAP program provides monthly benefits to low-income seniors for food purchases.",
    savingsRange: "$1,500 – $3,600/year",
    description: "North Carolina's SNAP program provides monthly benefits to low-income seniors for food purchases.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-snap-application", name: "North Carolina SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://epass.nc.gov" },
    ],
  },
  {
    id: "community-alternatives-program-for-disabled-adults-cap-da",
    name: "Community Alternatives Program for Disabled Adults (CAP/DA)",
    shortName: "CAP/DA",
    tagline: "Medicaid HCBS waiver providing in-home personal care, adult day health, and home modifications.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Medicaid HCBS waiver providing in-home personal care, adult day health, and home modifications.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-medicaid-application", name: "North Carolina Medicaid Application", description: "Official North Carolina Medicaid application, required for waiver enrollment.", url: "https://epass.nc.gov" },
      { id: "north-carolina-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://epass.nc.gov" },
    ],
  },
  {
    id: "senior-health-insurance-information-program-shiip",
    name: "Senior Health Insurance Information Program (SHIIP)",
    shortName: "SHIIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries and caregivers on Medicare options.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries and caregivers on Medicare options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Combines Medicare and Medicaid benefits into comprehensive care for frail seniors 55+.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Combines Medicare and Medicaid benefits into comprehensive care for frail seniors 55+.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://epass.nc.gov" },
      { id: "north-carolina-medicaid-application", name: "North Carolina Medicaid Application", description: "Medicaid eligibility may be required. Apply through North Carolina's portal.", url: "https://epass.nc.gov" },
    ],
  },
  {
    id: "low-income-energy-assistance-program-lieap",
    name: "Low-Income Energy Assistance Program (LIEAP)",
    shortName: "LIEAP",
    tagline: "Provides one-time payments to help eligible low-income seniors pay heating bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides one-time payments to help eligible low-income seniors pay heating bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-energy-application", name: "North Carolina Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.ncdhhs.gov/assistance/low-income-services/low-income-energy-assistance" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services including respite care, caregiver training, and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services including respite care, caregiver training, and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and adult care homes.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and adult care homes.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals-eat-right-to-age-well",
    name: "Home-Delivered Meals (Eat Right to Age Well)",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors through local Area Agencies on Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors through local Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "special-assistance-state-ssi-supplement",
    name: "Special Assistance (State SSI Supplement)",
    shortName: "SSI Supplement",
    tagline: "State supplement to federal SSI for low-income aged, blind, and disabled adults.",
    savingsRange: "$3,000 – $10,000/year",
    description: "State supplement to federal SSI for low-income aged, blind, and disabled adults.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $800/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "north-carolina-ssi-supplement", name: "North Carolina SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://epass.nc.gov" },
    ],
  },
  {
    id: "legal-aid-of-north-carolina-senior-legal-services",
    name: "Legal Aid of North Carolina Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors 60+ on issues including housing and benefits.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors 60+ on issues including housing and benefits.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "circuit-breaker-property-tax-deferral",
    name: "Circuit Breaker Property Tax Deferral",
    shortName: "Property Tax Relief",
    tagline: "Allows eligible seniors 65+ to defer a portion of property taxes on their principal residence.",
    savingsRange: "$500 – $2,500/year",
    description: "Allows eligible seniors 65+ to defer a portion of property taxes on their principal residence.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $31500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-carolina-property-tax-application", name: "North Carolina Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://epass.nc.gov" },
    ],
  },
];

// ─── North Dakota ────────────────────────────────────────────────────────────────

const northDakotaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-abd-medicaid",
    name: "Aged, Blind and Disabled (ABD) Medicaid",
    shortName: "ABD",
    tagline: "Provides Medicaid health coverage for North Dakota residents aged 65+, blind, or disabled.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides Medicaid health coverage for North Dakota residents aged 65+, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1200/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-medicaid-application", name: "North Dakota Medicaid Application", description: "Official North Dakota Medicaid application. Apply online or download a printable form.", url: "https://www.applyforhelp.nd.gov" },
    ],
  },
  {
    id: "home-and-community-based-services-hcbs-waiver",
    name: "Home and Community-Based Services (HCBS) Waiver",
    shortName: "HCBS",
    tagline: "Medicaid 1915(c) waiver providing long-term home and community-based services to prevent nursing home placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid 1915(c) waiver providing long-term home and community-based services to prevent nursing home placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2500/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-medicaid-application", name: "North Dakota Medicaid Application", description: "Official North Dakota Medicaid application, required for waiver enrollment.", url: "https://www.applyforhelp.nd.gov" },
      { id: "north-dakota-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.applyforhelp.nd.gov" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1300/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.applyforhelp.nd.gov" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides food assistance benefits to low-income North Dakota seniors for purchasing nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides food assistance benefits to low-income North Dakota seniors for purchasing nutritious food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-snap-application", name: "North Dakota SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.applyforhelp.nd.gov" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Assists eligible low-income North Dakota households, including seniors, with heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income North Dakota households, including seniors, with heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2825/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-energy-application", name: "North Dakota Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.applyforhelp.nd.gov" },
    ],
  },
  {
    id: "senior-medicare-patrol-smp",
    name: "Senior Medicare Patrol (SMP)",
    shortName: "SMP",
    tagline: "Free counseling and education on Medicare rights, coverage, and fraud prevention for seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free counseling and education on Medicare rights, coverage, and fraud prevention for seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-smp-referral", name: "Senior Medicare Patrol Volunteer/Referral Form", description: "Report suspected Medicare fraud, errors, or abuse, or volunteer as a counselor.", url: "https://www.smpresource.org" },
    ],
  },
  {
    id: "legal-services-of-north-dakota-senior-legal-helpline",
    name: "Legal Services of North Dakota - Senior Legal Helpline",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income North Dakota seniors on housing and benefits issues.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income North Dakota seniors on housing and benefits issues.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services to family caregivers of North Dakota seniors 60+ including respite care.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services to family caregivers of North Dakota seniors 60+ including respite care.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for rights and resolves complaints for North Dakota nursing home and assisted living residents.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for rights and resolves complaints for North Dakota nursing home and assisted living residents.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "senior-dining-services-home-delivered-meals",
    name: "Senior Dining Services (Home-Delivered Meals)",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound North Dakota seniors unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound North Dakota seniors unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "north-dakota-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Ohio ────────────────────────────────────────────────────────────────────────

const ohioPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-or-disabled-abd-medicaid",
    name: "Aged, Blind, or Disabled (ABD) Medicaid",
    shortName: "ABD",
    tagline: "Ohio's Medicaid program for individuals aged 65+, blind, or disabled with low income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Ohio's Medicaid program for individuals aged 65+, blind, or disabled with low income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-medicaid-application", name: "Ohio Medicaid Application", description: "Official Ohio Medicaid application. Apply online or download a printable form.", url: "https://benefits.ohio.gov" },
    ],
  },
  {
    id: "passport-waiver",
    name: "PASSPORT Waiver",
    shortName: "PASSPORT Waiver",
    tagline: "Home and Community-Based Services Medicaid waiver providing long-term care services at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and Community-Based Services Medicaid waiver providing long-term care services at home.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1491/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "ohio-ssi-supplement", name: "Ohio SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://benefits.ohio.gov" },
    ],
  },
  {
    id: "medicare-premium-assistance-programs",
    name: "Medicare Premium Assistance Programs",
    shortName: "Medicare Premium Assistance",
    tagline: "State-administered programs including QMB, SLMB, and QI that help pay Medicare costs.",
    savingsRange: "$3,000 – $10,000/year",
    description: "State-administered programs including QMB, SLMB, and QI that help pay Medicare costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $7330/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://benefits.ohio.gov" },
    ],
  },
  {
    id: "ohio-snap",
    name: "Ohio SNAP",
    shortName: "SNAP/Food",
    tagline: "Ohio's food assistance program providing monthly benefits via EBT card for food purchases.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Ohio's food assistance program providing monthly benefits via EBT card for food purchases.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-snap-application", name: "Ohio SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://benefits.ohio.gov" },
    ],
  },
  {
    id: "mycare-ohio-pace",
    name: "MyCare Ohio PACE",
    shortName: "MyCare Ohio PACE",
    tagline: "Program of All-Inclusive Care for the Elderly providing comprehensive medical and social services.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Program of All-Inclusive Care for the Elderly providing comprehensive medical and social services.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2500/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://benefits.ohio.gov" },
      { id: "ohio-medicaid-application", name: "Ohio Medicaid Application", description: "Medicaid eligibility may be required. Apply through Ohio's portal.", url: "https://benefits.ohio.gov" },
    ],
  },
  {
    id: "ohio-senior-health-insurance-information-program-oshiip",
    name: "Ohio Senior Health Insurance Information Program (OSHIIP)",
    shortName: "OSHIIP",
    tagline: "Free counseling and assistance with Medicare questions, plan choices, and appeals for seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free counseling and assistance with Medicare questions, plan choices, and appeals for seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "liheap",
    name: "LIHEAP",
    shortName: "Energy Assistance",
    tagline: "Low Income Home Energy Assistance Program helps eligible low-income Ohioans pay energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Low Income Home Energy Assistance Program helps eligible low-income Ohioans pay energy bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3092/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-energy-application", name: "Ohio Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://development.ohio.gov/individual/energy-assistance/home-energy-assistance-program" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services including caregiver training, respite care, and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services including caregiver training, respite care, and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3092/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "homestead-exemption",
    name: "Homestead Exemption",
    shortName: "Property Tax Relief",
    tagline: "Property tax relief program providing reduction in taxable value for owner-occupied homes.",
    savingsRange: "$500 – $2,500/year",
    description: "Property tax relief program providing reduction in taxable value for owner-occupied homes.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-property-tax-application", name: "Ohio Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://benefits.ohio.gov" },
    ],
  },
  {
    id: "home-delivered-meals-golden-buckeye-nutrition-program",
    name: "Home-Delivered Meals (Golden Buckeye Nutrition Program)",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors who are unable to prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors who are unable to prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "ohio-legal-services-for-seniors",
    name: "Ohio Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income Ohio seniors facing issues like housing and benefits.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income Ohio seniors facing issues like housing and benefits.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "ohio-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Oklahoma ────────────────────────────────────────────────────────────────────

const oklahomaPrograms: WaiverProgram[] = [
  {
    id: "soonercare-aged-blind-and-disabled",
    name: "SoonerCare Aged Blind and Disabled",
    shortName: "SoonerCare Aged Blind and",
    tagline: "Provides Medicaid health coverage to low-income seniors aged 65+ who are aged, blind, or disabled.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Provides Medicaid health coverage to low-income seniors aged 65+ who are aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-medicaid-application", name: "Oklahoma Medicaid Application", description: "Official Oklahoma Medicaid application. Apply online or download a printable form.", url: "https://www.oklahoma.gov/ohca/individuals/apply" },
    ],
  },
  {
    id: "advantage-waiver-program",
    name: "ADvantage Waiver Program",
    shortName: "ADvantage Waiver Program",
    tagline: "Home and community-based services waiver providing personal care, adult day health, and respite.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services waiver providing personal care, adult day health, and respite.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-medicaid-application", name: "Oklahoma Medicaid Application", description: "Official Oklahoma Medicaid application, required for waiver enrollment.", url: "https://www.oklahoma.gov/ohca/individuals/apply" },
      { id: "oklahoma-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.oklahoma.gov/ohca/individuals/apply" },
    ],
  },
  {
    id: "soonercare-medicare-savings-programs",
    name: "SoonerCare Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for Medicare premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.oklahoma.gov/ohca/individuals/apply" },
    ],
  },
  {
    id: "snap-food-benefits",
    name: "SNAP Food Benefits",
    shortName: "SNAP/Food",
    tagline: "Provides monthly food assistance benefits to low-income seniors to purchase groceries.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly food assistance benefits to low-income seniors to purchase groceries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-snap-application", name: "Oklahoma SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.oklahoma.gov/okdhs/services/snap" },
    ],
  },
  {
    id: "oklahoma-senior-health-insurance-assistance-program-ship",
    name: "Oklahoma Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on plan choices, appeals, and enrollment.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries on plan choices, appeals, and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists low-income households, including seniors, with heating and cooling bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists low-income households, including seniors, with heating and cooling bills.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2490/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-energy-application", name: "Oklahoma Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.oklahoma.gov/okdhs/services/cap/liheap" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3120/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "commodity-supplemental-food-program-csfp-and-home-delivered-",
    name: "Commodity Supplemental Food Program (CSFP) and Home-Delivered Meals",
    shortName: "CSFP",
    tagline: "Provides monthly food boxes to low-income seniors 60+ and home-delivered meals.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly food boxes to low-income seniors 60+ and home-delivered meals.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-snap-application", name: "Oklahoma SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.oklahoma.gov/okdhs/services/snap" },
    ],
  },
  {
    id: "legal-aid-services-of-oklahoma-senior-legal-hotline",
    name: "Legal Aid Services of Oklahoma - Senior Legal Hotline",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal advice and representation for low-income seniors on benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal advice and representation for low-income seniors on benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oklahoma-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Oregon ──────────────────────────────────────────────────────────────────────

const oregonPrograms: WaiverProgram[] = [
  {
    id: "oregon-medicaid-aged-and-physically-disabled-apd-waiver",
    name: "Oregon Medicaid - Aged and Physically Disabled (APD) Waiver",
    shortName: "APD",
    tagline: "Medicaid program providing long-term services and supports including home and community-based services.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid program providing long-term services and supports including home and community-based services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oregon-medicaid-application", name: "Oregon Medicaid Application", description: "Official Oregon Medicaid application, required for waiver enrollment.", url: "https://one.oregon.gov" },
      { id: "oregon-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://one.oregon.gov" },
    ],
  },
  {
    id: "oregon-project-independence-medicaid-opi-m",
    name: "Oregon Project Independence - Medicaid (OPI-M)",
    shortName: "OPI-M",
    tagline: "Section 1115 Medicaid demonstration waiver for seniors 60+ and physically disabled individuals.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Section 1115 Medicaid demonstration waiver for seniors 60+ and physically disabled individuals.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $4800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oregon-medicaid-application", name: "Oregon Medicaid Application", description: "Official Oregon Medicaid application. Apply online or download a printable form.", url: "https://one.oregon.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides caregiver education, training, and community support services for unpaid caregivers of seniors.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides caregiver education, training, and community support services for unpaid caregivers of seniors.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "oregon-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Pennsylvania ────────────────────────────────────────────────────────────────

const pennsylvaniaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "Provides basic healthcare and long-term care services for Pennsylvania residents aged 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides basic healthcare and long-term care services for Pennsylvania residents aged 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $988/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-medicaid-application", name: "Pennsylvania Medicaid Application", description: "Official Pennsylvania Medicaid application. Apply online or download a printable form.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "community-healthchoices",
    name: "Community HealthChoices",
    shortName: "Community HealthChoices",
    tagline: "Medicaid managed care waiver program offering home and community-based services for seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Medicaid managed care waiver program offering home and community-based services for seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $988/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-medicaid-application", name: "Pennsylvania Medicaid Application", description: "Official Pennsylvania Medicaid application, required for waiver enrollment.", url: "https://www.compass.state.pa.us" },
      { id: "pennsylvania-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1400/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "snap",
    name: "SNAP",
    shortName: "SNAP/Food",
    tagline: "Provides monthly food assistance benefits to low-income seniors to purchase groceries.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly food assistance benefits to low-income seniors to purchase groceries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-snap-application", name: "Pennsylvania SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "pennsylvania-life-program-pace",
    name: "Pennsylvania LIFE Program (PACE)",
    shortName: "PACE",
    tagline: "Program of All-Inclusive Care for the Elderly providing comprehensive medical care for frail seniors.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Program of All-Inclusive Care for the Elderly providing comprehensive medical care for frail seniors.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.compass.state.pa.us" },
      { id: "pennsylvania-medicaid-application", name: "Pennsylvania Medicaid Application", description: "Medicaid eligibility may be required. Apply through Pennsylvania's portal.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "pharmaceutical-assistance-contract-for-the-elderly-pace",
    name: "Pharmaceutical Assistance Contract for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "State Pharmaceutical Assistance Program helping seniors pay for prescription drugs.",
    savingsRange: "$15,000 – $35,000/year",
    description: "State Pharmaceutical Assistance Program helping seniors pay for prescription drugs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.compass.state.pa.us" },
      { id: "pennsylvania-medicaid-application", name: "Pennsylvania Medicaid Application", description: "Medicaid eligibility may be required. Apply through Pennsylvania's portal.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "liheap",
    name: "LIHEAP",
    shortName: "Energy Assistance",
    tagline: "Assists eligible low-income households, including seniors, with heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income households, including seniors, with heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-energy-application", name: "Pennsylvania Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "pennsylvania-ship",
    name: "Pennsylvania SHIP",
    shortName: "Pennsylvania SHIP",
    tagline: "State Health Insurance Assistance Program provides free, unbiased counseling on Medicare.",
    savingsRange: "Free counseling service",
    description: "State Health Insurance Assistance Program provides free, unbiased counseling on Medicare.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "property-tax-rent-rebate-program",
    name: "Property Tax/Rent Rebate Program",
    shortName: "Property Tax Relief",
    tagline: "Provides rebates for property taxes or rent paid by eligible seniors and disabled persons.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides rebates for property taxes or rent paid by eligible seniors and disabled persons.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $16000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-property-tax-application", name: "Pennsylvania Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors through Area Agencies on Aging.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors through Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services for family caregivers of seniors 60+, including counseling and respite.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services for family caregivers of seniors 60+, including counseling and respite.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "state-ssi-supplement",
    name: "State SSI Supplement",
    shortName: "SSI Supplement",
    tagline: "Pennsylvania provides a small monthly supplement to federal SSI payments for eligible recipients.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Pennsylvania provides a small monthly supplement to federal SSI payments for eligible recipients.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $943/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "pennsylvania-ssi-supplement", name: "Pennsylvania SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://www.compass.state.pa.us" },
    ],
  },
  {
    id: "pennsylvania-legal-aid-network-senior-legal-services",
    name: "Pennsylvania Legal Aid Network - Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors for issues like benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors for issues like benefits and housing.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "pennsylvania-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Rhode Island ────────────────────────────────────────────────────────────────

const rhodeIslandPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-elders-and-adults-with-disabilities-ead",
    name: "Medicaid for Elders and Adults with Disabilities (EAD)",
    shortName: "EAD",
    tagline: "Provides Medicaid coverage for seniors aged 65+ who are disabled or elderly with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides Medicaid coverage for seniors aged 65+ who are disabled or elderly with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-medicaid-application", name: "Rhode Island Medicaid Application", description: "Official Rhode Island Medicaid application. Apply online or download a printable form.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "long-term-services-and-supports-ltss-waiver",
    name: "Long Term Services and Supports (LTSS) Waiver",
    shortName: "LTSS",
    tagline: "HCBS Medicaid waiver providing personal care, meal preparation, and home-based support services.",
    savingsRange: "$10,000 – $30,000/year",
    description: "HCBS Medicaid waiver providing personal care, meal preparation, and home-based support services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-medicaid-application", name: "Rhode Island Medicaid Application", description: "Official Rhode Island Medicaid application, required for waiver enrollment.", url: "https://healthyrhode.ri.gov" },
      { id: "rhode-island-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "rhode-island-medicare-savings-program",
    name: "Rhode Island Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1304/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "rhode-island-snap",
    name: "Rhode Island SNAP",
    shortName: "SNAP/Food",
    tagline: "Provides food assistance benefits through an EBT card to low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides food assistance benefits through an EBT card to low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-snap-application", name: "Rhode Island SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Combines Medicare and Medicaid benefits into comprehensive care for dual-eligible seniors.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Combines Medicare and Medicaid benefits into comprehensive care for dual-eligible seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://healthyrhode.ri.gov" },
      { id: "rhode-island-medicaid-application", name: "Rhode Island Medicaid Application", description: "Medicaid eligibility may be required. Apply through Rhode Island's portal.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "rhode-island-liheap",
    name: "Rhode Island LIHEAP",
    shortName: "Energy Assistance",
    tagline: "Low-Income Home Energy Assistance Program provides grants to help eligible seniors pay energy bills.",
    savingsRange: "$500 – $2,000/year",
    description: "Low-Income Home Energy Assistance Program provides grants to help eligible seniors pay energy bills.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3333/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-energy-application", name: "Rhode Island Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dhs.ri.gov/programs-and-services/energy-assistance-programs" },
    ],
  },
  {
    id: "rhode-island-state-ssi-supplement",
    name: "Rhode Island State SSI Supplement",
    shortName: "SSI Supplement",
    tagline: "Provides monthly cash supplement to SSI recipients who are aged, blind, or disabled.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides monthly cash supplement to SSI recipients who are aged, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $943/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "rhode-island-ssi-supplement", name: "Rhode Island SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "rhode-island-ship",
    name: "Rhode Island SHIP",
    shortName: "Rhode Island SHIP",
    tagline: "State Health Insurance Assistance Program offers free counseling on Medicare options and appeals.",
    savingsRange: "Free counseling service",
    description: "State Health Insurance Assistance Program offers free counseling on Medicare options and appeals.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "rhode-island-property-tax-relief-for-seniors",
    name: "Rhode Island Property Tax Relief for Seniors",
    shortName: "Property Tax Relief",
    tagline: "Provides tax credits or freezes for eligible senior homeowners and renters based on income.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides tax credits or freezes for eligible senior homeowners and renters based on income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $35750/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-property-tax-application", name: "Rhode Island Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://healthyrhode.ri.gov" },
    ],
  },
  {
    id: "rhode-island-long-term-care-ombudsman-program",
    name: "Rhode Island Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in nursing homes, assisted living, and other long-term care facilities.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in nursing homes, assisted living, and other long-term care facilities.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "meals-on-wheels-rhode-island",
    name: "Meals on Wheels Rhode Island",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors to promote health and independence.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors to promote health and independence.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "rhode-island-family-caregiver-support-program",
    name: "Rhode Island Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services including respite care, counseling, training, and supplemental services.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services including respite care, counseling, training, and supplemental services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3333/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "rhode-island-legal-services-senior-law-project",
    name: "Rhode Island Legal Services Senior Law Project",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors on issues like housing and benefits.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors on issues like housing and benefits.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "rhode-island-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── South Carolina ──────────────────────────────────────────────────────────────

const southCarolinaPrograms: WaiverProgram[] = [
  {
    id: "healthy-connections-aged-blind-or-disabled-abd",
    name: "Healthy Connections Aged, Blind or Disabled (ABD)",
    shortName: "ABD",
    tagline: "South Carolina's Medicaid program for seniors aged 65+, blind, or disabled with limited income.",
    savingsRange: "$1,000 – $5,000/year",
    description: "South Carolina's Medicaid program for seniors aged 65+, blind, or disabled with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-medicaid-application", name: "South Carolina Medicaid Application", description: "Official South Carolina Medicaid application. Apply online or download a printable form.", url: "https://apply.scdhhs.gov" },
    ],
  },
  {
    id: "community-choices-waiver",
    name: "Community Choices Waiver",
    shortName: "Community Choices Waiver",
    tagline: "Home and community-based services Medicaid waiver for frail elderly aged 65+ requiring nursing-level care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waiver for frail elderly aged 65+ requiring nursing-level care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2982/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-medicaid-application", name: "South Carolina Medicaid Application", description: "Official South Carolina Medicaid application, required for waiver enrollment.", url: "https://apply.scdhhs.gov" },
      { id: "south-carolina-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://apply.scdhhs.gov" },
    ],
  },
  {
    id: "healthy-connections-medicare-savings-programs",
    name: "Healthy Connections Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1305/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://apply.scdhhs.gov" },
    ],
  },
  {
    id: "snap-supplemental-nutrition-assistance-program",
    name: "SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "South Carolina's food assistance program providing monthly benefits to low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "South Carolina's food assistance program providing monthly benefits to low-income seniors.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-snap-application", name: "South Carolina SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dss.sc.gov/assistance/snap/" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Combines Medicare and Medicaid benefits into comprehensive care for dual-eligible frail seniors.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Combines Medicare and Medicaid benefits into comprehensive care for dual-eligible frail seniors.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2982/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://apply.scdhhs.gov" },
      { id: "south-carolina-medicaid-application", name: "South Carolina Medicaid Application", description: "Medicaid eligibility may be required. Apply through South Carolina's portal.", url: "https://apply.scdhhs.gov" },
    ],
  },
  {
    id: "south-carolina-ship",
    name: "South Carolina SHIP",
    shortName: "South Carolina SHIP",
    tagline: "State Health Insurance Assistance Program providing free, unbiased counseling on Medicare options.",
    savingsRange: "Free counseling service",
    description: "State Health Insurance Assistance Program providing free, unbiased counseling on Medicare options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "liheap-low-income-home-energy-assistance-program",
    name: "LIHEAP (Low-Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Federal program helping low-income seniors pay heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Federal program helping low-income seniors pay heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2800/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-energy-application", name: "South Carolina Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dss.sc.gov/assistance/liheap/" },
    ],
  },
  {
    id: "south-carolina-long-term-care-ombudsman-program",
    name: "South Carolina Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals-sc-department-on-aging",
    name: "Home Delivered Meals (SC Department on Aging)",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors unable to prepare food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors unable to prepare food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Supports family caregivers of seniors 60+ with services like respite care, counseling, and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Supports family caregivers of seniors 60+ with services like respite care, counseling, and training.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "south-carolina-legal-services-senior-legal-services",
    name: "South Carolina Legal Services Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Free legal assistance for low-income seniors on issues like housing, benefits, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Free legal assistance for low-income seniors on issues like housing, benefits, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2200/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-carolina-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── South Dakota ────────────────────────────────────────────────────────────────

const southDakotaPrograms: WaiverProgram[] = [
  {
    id: "regular-medicaid-aged-blind-and-disabled",
    name: "Regular Medicaid / Aged, Blind, and Disabled",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare coverage and long-term care services to low-income seniors aged 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare coverage and long-term care services to low-income seniors aged 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-medicaid-application", name: "South Dakota Medicaid Application", description: "Official South Dakota Medicaid application. Apply online or download a printable form.", url: "https://dss.sd.gov/medicaid/eligibility/apply.aspx" },
    ],
  },
  {
    id: "hope-waiver",
    name: "HOPE Waiver",
    shortName: "HOPE Waiver",
    tagline: "Home and Community-Based Services waiver for nursing home-eligible seniors aged 65+.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and Community-Based Services waiver for nursing home-eligible seniors aged 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-medicaid-application", name: "South Dakota Medicaid Application", description: "Official South Dakota Medicaid application, required for waiver enrollment.", url: "https://dss.sd.gov/medicaid/eligibility/apply.aspx" },
      { id: "south-dakota-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dss.sd.gov/medicaid/eligibility/apply.aspx" },
    ],
  },
  {
    id: "medicare-savings-program",
    name: "Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://dss.sd.gov/medicaid/eligibility/apply.aspx" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits to low-income households to purchase nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits to low-income households to purchase nutritious food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1981/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-snap-application", name: "South Dakota SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dss.sd.gov/economic-assistance/snap/" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists eligible low-income households with heating and cooling costs and crisis assistance.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income households with heating and cooling costs and crisis assistance.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2798/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-energy-application", name: "South Dakota Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dss.sd.gov/economic-assistance/energy-assistance/" },
    ],
  },
  {
    id: "south-dakota-senior-health-insurance-assistance-program-ship",
    name: "South Dakota Senior Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Offers free, unbiased counseling and assistance for Medicare beneficiaries.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Offers free, unbiased counseling and assistance for Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors through the Nutrition Services program.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors through the Nutrition Services program.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Provides support services including respite care, caregiver training, and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Provides support services including respite care, caregiver training, and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "senior-legal-services",
    name: "Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors on issues like benefits and housing.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors on issues like benefits and housing.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2798/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "south-dakota-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Tennessee ───────────────────────────────────────────────────────────────────

const tennesseePrograms: WaiverProgram[] = [
  {
    id: "tenncare-choices-in-long-term-services-and-supports",
    name: "TennCare CHOICES in Long-Term Services and Supports",
    shortName: "TennCare CHOICES in Long-Term",
    tagline: "Tennessee's Medicaid program for seniors aged 65+ and adults 21+ with physical disabilities.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Tennessee's Medicaid program for seniors aged 65+ and adults 21+ with physical disabilities.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-medicaid-application", name: "Tennessee Medicaid Application", description: "Official Tennessee Medicaid application, required for waiver enrollment.", url: "https://www.tn.gov/tenncare/members/apply.html" },
      { id: "tennessee-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.tn.gov/tenncare/members/apply.html" },
    ],
  },
  {
    id: "tenncare-medicare-savings-programs",
    name: "TennCare Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI for Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI for Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1605/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.tn.gov/tenncare/members/apply.html" },
    ],
  },
  {
    id: "tenncare-choices-hcbs-waiver",
    name: "TennCare CHOICES HCBS Waiver",
    shortName: "TennCare CHOICES HCBS Waiver",
    tagline: "Home and community-based services waiver under TennCare CHOICES program for at-home care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services waiver under TennCare CHOICES program for at-home care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-medicaid-application", name: "Tennessee Medicaid Application", description: "Official Tennessee Medicaid application, required for waiver enrollment.", url: "https://www.tn.gov/tenncare/members/apply.html" },
      { id: "tennessee-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.tn.gov/tenncare/members/apply.html" },
    ],
  },
  {
    id: "tennessee-snap-supplemental-nutrition-assistance-program",
    name: "Tennessee SNAP (Supplemental Nutrition Assistance Program)",
    shortName: "SNAP/Food",
    tagline: "Provides food assistance benefits via EBT card to low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides food assistance benefits via EBT card to low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-snap-application", name: "Tennessee SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://fabenefits.tn.gov" },
    ],
  },
  {
    id: "tennessee-state-health-insurance-assistance-program-ship",
    name: "Tennessee State Health Insurance Assistance Program (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and enrollment assistance for Medicare beneficiaries.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and enrollment assistance for Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "tennessee-liheap-low-income-home-energy-assistance-program",
    name: "Tennessee LIHEAP (Low Income Home Energy Assistance Program)",
    shortName: "Energy Assistance",
    tagline: "Federally funded program helping eligible low-income households with heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Federally funded program helping eligible low-income households with heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3092/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-energy-application", name: "Tennessee Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.tn.gov/humanservices/for-families/supplemental-nutrition-assistance-program-snap/liheap.html" },
    ],
  },
  {
    id: "tennessee-long-term-care-ombudsman-program",
    name: "Tennessee Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "tennessee-home-delivered-meals",
    name: "Tennessee Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors through Older Americans Act funding.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors through Older Americans Act funding.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "tennessee-family-caregiver-support-program",
    name: "Tennessee Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services for family caregivers of seniors 60+, including respite care and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services for family caregivers of seniors 60+, including respite care and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "tennessee-senior-legal-services",
    name: "Tennessee Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors through Area Agencies on Aging.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors through Area Agencies on Aging.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "tennessee-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Texas ───────────────────────────────────────────────────────────────────────

const texasPrograms: WaiverProgram[] = [
  {
    id: "star-plus-home-and-community-based-services",
    name: "Texas STAR+PLUS Waiver",
    shortName: "STAR+PLUS Waiver",
    tagline: "Medicaid managed care program for adults 65+ or disabled. Covers personal attendant services and community-based care.",
    savingsRange: "$20,000 – $50,000/year in 2026",
    description: "Medicaid managed care program for adults 65+ or disabled. Covers personal attendant services and community-based care.",
    intro: "STAR+PLUS Home and Community-Based Services is Texas's primary Medicaid managed care program for adults who are 65 or older or living with a disability. It provides personal attendant services, adaptive aids, and community-based supports that help Texans stay safely in their homes instead of moving to a nursing facility. For families navigating long-term care in Texas, STAR+PLUS is often the most comprehensive option available.",
    eligibilityHighlights: [
      "Age 21 or older",
      "Income below $2,982/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Check you meet the age 21+ and $2,982/month income limit for Texas in 2026." },
      { step: 2, title: "Gather required documents", description: "Gather Social Security statements, bank records, and a Texas utility bill or lease." },
      { step: 3, title: "Download forms", description: "Download the Texas Medicaid Application and HCBS Waiver Referral Form." },
      { step: 4, title: "Submit your application", description: "Submit to Texas HHS — processing takes 30–90 days. Call 211 to join the interest list now." },
    ],
    forms: [
      { id: "texas-medicaid-application", name: "Texas Medicaid Application Form", description: "Official Texas Medicaid application, required for waiver enrollment.", url: "https://www.yourtexasbenefits.com" },
      { id: "texas-hcbs-referral", name: "HCBS Waiver Referral Form Texas", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.yourtexasbenefits.com" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas", description: "Dallas, Collin, Denton counties" },
      { name: "Fort Worth", description: "Tarrant County" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
    ],
    serviceAreasHeading: "STAR+PLUS Service Locations in Texas",
    faqs: [
      {
        question: "Can I have Medicare and still qualify for STAR+PLUS?",
        answer: "Yes. Most STAR+PLUS members are \"dual eligible,\" meaning they have both Medicare and Medicaid. Medicare covers hospital and doctor visits while STAR+PLUS adds home care, personal attendant services, and other community-based supports that Medicare does not cover. Having Medicare does not disqualify you.",
      },
      {
        question: "Is there a waitlist to get into the program?",
        answer: "STAR+PLUS does maintain an interest list in many service areas, and wait times can range from several months to over a year depending on your location and level of need. We strongly recommend calling 2-1-1 as soon as possible to get your name on the interest list while your application is being processed.",
      },
      {
        question: "How long does it take for my application to be processed?",
        answer: "Application processing typically takes 30 to 90 days from the date Texas Health and Human Services receives your completed application and all supporting documents. Incomplete applications or missing documents are the most common cause of delays, so use the document checklist above to make sure everything is ready before you submit.",
      },
    ],
  },
  {
    id: "texas-medicare-savings-programs",
    name: "Texas Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs that pay Medicare premiums and costs for low-income beneficiaries.",
    savingsRange: "$2,000 – $8,000/year in 2026",
    description: "State-administered programs that pay Medicare premiums and costs for low-income beneficiaries.",
    intro: "Texas Medicare Savings Programs help low-income Medicare beneficiaries cover the cost of premiums, deductibles, and copays that Medicare alone doesn't pay. Administered by the state of Texas, these programs — including QMB, SLMB, and QI — can save eligible seniors thousands of dollars each year on healthcare costs. If you're on Medicare in Texas and struggling with out-of-pocket expenses, this program may be able to help.",
    eligibilityHighlights: [
      "Income below $1,796/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Confirm your income is below $1,796/month and you are currently enrolled in Medicare Part A or Part B." },
      { step: 2, title: "Gather required documents", description: "Collect your Medicare card, Social Security statements, proof of income, and a Texas ID or utility bill." },
      { step: 3, title: "Download forms", description: "Download the Medicare Savings Program Application to apply for QMB, SLMB, or QI coverage." },
      { step: 4, title: "Submit your application", description: "Submit online at YourTexasBenefits.com or mail to your local HHS office. Processing takes 30 to 45 days." },
    ],
    forms: [
      { id: "texas-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.yourtexasbenefits.com" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas", description: "Dallas, Collin, Denton counties" },
      { name: "Fort Worth", description: "Tarrant County" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
    ],
    serviceAreasHeading: "Medicare Savings Locations in Texas",
    serviceAreasSummary: "Texas Medicare Savings Programs are available statewide. Find the office closest to you.",
    faqs: [
      {
        question: "What are the income limits for Texas Medicare Savings Programs in 2026?",
        answer: "For 2026, the highest income limit for Texas Medicare Savings Programs is $1,796 per month for individuals at the QI level, which represents 135% of the federal poverty level. QMB has the lowest income threshold, followed by SLMB, and then QI for those with slightly higher incomes. To qualify for any of these programs, you must already be enrolled in Medicare and meet both income and resource limits set by the state. These are state-administered programs run through the Texas Health and Human Services Commission.",
      },
      {
        question: "How do I apply for Texas Medicare Savings Programs and how long does approval take?",
        answer: "You can apply online through YourTexasBenefits.com or in person at your local Texas Health and Human Services office. The application requires proof of income and assets so the state can determine which program level you qualify for. Processing typically takes 30 to 45 days from the time your completed application is received. If approved, SLMB and QI benefits can be applied retroactively for up to three months before your application date, so it is worth applying as soon as you think you may be eligible.",
      },
      {
        question: "What is the difference between QMB, SLMB, and QI in Texas Medicare Savings Programs?",
        answer: "The biggest difference is what each program covers. QMB is the most comprehensive, paying for your Medicare premiums, deductibles, and copays, which means Medicare providers cannot bill you for any remaining costs on covered services. SLMB and QI only cover your monthly Part B premium and do not help with deductibles, copays, or coinsurance. QMB has the lowest income limit of the three, while QI allows higher incomes but is funded on a first-come, first-served basis, so applying early in the year is recommended.",
      },
    ],
  },
  {
    id: "texas-snap-food-benefits",
    name: "Texas SNAP Food Benefits",
    shortName: "SNAP/Food",
    tagline: "Monthly benefits loaded onto a Lone Star Card to buy groceries. Seniors 60+ can apply with simplified rules.",
    savingsRange: "$1,500 – $3,600/year in 2026",
    description: "Monthly benefits loaded onto a Lone Star Card to buy groceries. Seniors 60+ can apply with simplified rules.",
    intro: "Texas SNAP Food Benefits provide monthly grocery assistance loaded directly onto a Lone Star Card, helping seniors and families across Texas put nutritious food on the table. Older adults aged 60 and above can apply through simplified rules that make the process easier. For many Texas seniors living on a fixed income, SNAP benefits are a vital lifeline that helps stretch every dollar.",
    eligibilityHighlights: [
      "Income below $1,729/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Verify your household income is below $1,729/month. Seniors 60+ qualify under simplified rules." },
      { step: 2, title: "Gather required documents", description: "Prepare your Texas ID, pay stubs or Social Security statements, rent/mortgage receipts, and utility bills." },
      { step: 3, title: "Download forms", description: "Download the Texas SNAP Application or apply directly online at YourTexasBenefits.com." },
      { step: 4, title: "Submit your application", description: "Submit online, by mail, or in person. Complete a phone interview within 30 days to receive your Lone Star Card." },
    ],
    forms: [
      { id: "texas-snap-application", name: "Texas SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.yourtexasbenefits.com" },
    ],
    faqs: [
      {
        question: "What is the income limit for Texas SNAP benefits for seniors over 60?",
        answer: "For 2026, a single person in Texas can earn up to $1,729 per month (130% of the federal poverty level) and still qualify for SNAP benefits. Seniors aged 60 and older may qualify under simplified rules with fewer reporting requirements, making the process easier. Texas also uses broad-based categorical eligibility, which means there is no asset or resource test for most applicants. The average monthly benefit for a single senior is around $100 to $200.",
      },
      {
        question: "How long does it take to get a Texas SNAP Lone Star Card after you apply?",
        answer: "You can apply online at YourTexasBenefits.com or visit your local Health and Human Services office in person. After submitting your application, you will need to complete an interview by phone or in person before a decision is made. Texas is required to process most applications within 30 days, though if you are in an urgent situation you may qualify for expedited benefits within 7 days. Once approved, your benefits are loaded onto a Lone Star Card, which is the Texas version of an EBT card.",
      },
      {
        question: "Can you use a Texas SNAP Lone Star Card to buy groceries online?",
        answer: "Yes, Texas SNAP recipients can use their Lone Star Card to order groceries online for delivery or pickup through approved retailers including Amazon, Walmart, and H-E-B. The card works just like a debit card at approved grocery stores and farmers markets as well. SNAP benefits cover most food items such as fruits, vegetables, meat, dairy, bread, and cereals. However, you cannot use SNAP to purchase hot prepared foods, alcohol, tobacco, vitamins, or non-food household items.",
      },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas / Fort Worth", description: "Dallas, Collin, Denton, Tarrant counties" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
      { name: "Rio Grande Valley", description: "Hidalgo, Cameron counties" },
      { name: "Corpus Christi", description: "Nueces County" },
      { name: "Lubbock / Amarillo", description: "Lubbock, Potter, Randall counties" },
    ],
    serviceAreasHeading: "SNAP Office Locations in Texas",
  },
  {
    id: "texas-medicaid-for-the-elderly-and-people-with-disabilities",
    name: "Texas Medicaid for the Elderly and People with Disabilities",
    shortName: "Texas Medicaid for the",
    tagline: "Full Medicaid coverage for seniors 65+ and people with disabilities with limited income.",
    savingsRange: "$5,000 – $20,000/year in 2026",
    description: "Full Medicaid coverage for seniors 65+ and people with disabilities with limited income.",
    intro: "Texas Medicaid for the Elderly and People with Disabilities provides comprehensive health coverage to older Texans and individuals living with disabilities who have limited income. This program covers doctor visits, hospital stays, prescriptions, and long-term care services that would otherwise be unaffordable. It is one of the most important safety-net programs in Texas for seniors who need ongoing medical care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $994/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Confirm you are 65+ or have a qualifying disability, and that your income is below $994/month (SSI level)." },
      { step: 2, title: "Gather required documents", description: "Collect your birth certificate or passport, Social Security card, bank statements, and proof of Texas residency." },
      { step: 3, title: "Download forms", description: "Download the Texas Medicaid Application from YourTexasBenefits.com or request a paper copy by calling 2-1-1." },
      { step: 4, title: "Submit your application", description: "Submit online, by mail, or at your local HHS office. Expect a decision within 45 days of submitting all documents." },
    ],
    forms: [
      { id: "texas-medicaid-application", name: "Texas Medicaid Application", description: "Official Texas Medicaid application. Apply online or download a printable form.", url: "https://www.yourtexasbenefits.com" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas", description: "Dallas, Collin, Denton counties" },
      { name: "Fort Worth", description: "Tarrant County" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
    ],
    serviceAreasHeading: "Medicaid for Elderly Locations in Texas",
    faqs: [
      {
        question: "What are the income and asset limits for Texas Medicaid for the Elderly and People with Disabilities in 2026?",
        answer: "For a single individual, the income limit for Texas MEPD is $994 per month (the SSI federal benefit rate), and countable assets must be $2,000 or less. For a married couple, the combined income limit is $1,491 per month with a $3,000 asset limit. Countable assets include bank accounts, retirement accounts, stocks, bonds, and certificates of deposit. You must also be a Texas resident and a U.S. citizen or qualified non-citizen to be eligible.",
      },
      {
        question: "How long does it take to get approved for Texas Medicaid for the Elderly and People with Disabilities?",
        answer: "Most MEPD applications are processed within 45 days from the date HHSC receives your completed and signed application. However, if you are under 65 and your disability has not already been established through the Social Security Administration, the timeline extends to 90 days because the HHSC Disability Determination Unit must review your case separately. You can apply online at YourTexasBenefits.com, by calling 2-1-1, or in person at your local HHSC office.",
      },
      {
        question: "What is the difference between Texas Medicaid for the Elderly and People with Disabilities and STAR+PLUS?",
        answer: "MEPD is the eligibility category that determines whether you qualify for Medicaid based on age (65+) or disability, while STAR+PLUS is the managed care delivery system through which most MEPD beneficiaries actually receive their healthcare services. MEPD itself is an entitlement, meaning anyone who meets the requirements is guaranteed coverage by law with no waiting list. The STAR+PLUS Home and Community-Based Services waiver, on the other hand, has limited enrollment slots and may place additional applicants on a waitlist. In short, MEPD gets you approved for Medicaid, and STAR+PLUS is how Texas delivers the care.",
      },
    ],
  },
  {
    id: "texas-ship-medicare-counseling",
    name: "Texas SHIP Medicare Counseling",
    shortName: "Texas SHIP Medicare Counseling",
    tagline: "Free, unbiased help understanding Medicare options. Certified counselors help compare plans.",
    savingsRange: "Free counseling service in 2026",
    description: "Free, unbiased help understanding Medicare options. Certified counselors help compare plans.",
    intro: "The Texas SHIP Medicare Counseling program offers free, unbiased guidance from certified counselors who help you understand and compare Medicare plan options. Whether you're enrolling in Medicare for the first time or reviewing your coverage during open enrollment, Texas SHIP counselors can help you find the plan that best fits your needs and budget. This service is completely free and is available to all Medicare beneficiaries in Texas.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "SHIP is free and open to all Medicare beneficiaries in Texas. No income or age restrictions apply." },
      { step: 2, title: "Gather your Medicare info", description: "Have your Medicare card, current plan details, and a list of your prescriptions ready for your counseling session." },
      { step: 3, title: "Download forms", description: "Download the SHIP counseling request form or call 1-800-252-9240 to schedule a session by phone." },
      { step: 4, title: "Meet with a counselor", description: "A certified SHIP volunteer will compare plans and help you choose the best Medicare coverage for your needs." },
    ],
    forms: [
      { id: "texas-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
    faqs: [
      {
        question: "What does Texas SHIP Medicare counseling help with?",
        answer: "Texas SHIP, known locally as HICAP (Health Information, Counseling and Advocacy Program), provides free, unbiased Medicare counseling to anyone on Medicare or approaching Medicare eligibility. The program is run through the Texas Department of Insurance and staffed by trained volunteers who can help with Medicare enrollment, comparing Medicare Advantage and Medigap plans, understanding Medicare bills, filing appeals, and identifying low-income assistance programs like Medicare Savings Programs or Extra Help. SHIP counselors do not sell insurance products or receive commissions, so their guidance is based entirely on your situation. You can reach Texas SHIP by calling 1-800-252-9240 to connect with a local counselor.",
      },
      {
        question: "How do I schedule a Texas SHIP Medicare counseling appointment and how long does it take?",
        answer: "To schedule a counseling session, call the Texas SHIP helpline at 1-800-252-9240, and staff will connect you with a trained volunteer counselor in your area. Sessions can take place by phone, in person at a local counseling site, or at community events like senior centers and libraries. Most one-on-one sessions last 30 to 60 minutes depending on the complexity of your questions, and counselors recommend scheduling well before key Medicare deadlines like the Annual Enrollment Period (October 15 through December 7). Bring your Medicare card, any plan materials, and a list of your current prescriptions so your counselor can give you the most accurate guidance.",
      },
      {
        question: "How is Texas SHIP different from calling an insurance broker or 1-800-MEDICARE?",
        answer: "Texas SHIP counselors are trained volunteers who work through the Texas Department of Insurance, not licensed insurance agents, which means they have no financial incentive to steer you toward any particular plan. Unlike an insurance broker, a SHIP counselor will never sell you a product or earn a commission from your enrollment decision. Compared to 1-800-MEDICARE, which provides general program information, Texas SHIP offers personalized, one-on-one counseling tailored to your specific health needs, medications, and budget. SHIP counselors can also help with issues that go beyond enrollment, such as disputing Medicare billing errors, filing appeals for denied claims, and screening you for Texas-specific assistance programs.",
      },
    ],
  },
  {
    id: "texas-comprehensive-energy-assistance-program-ceap-liheap",
    name: "Texas Comprehensive Energy Assistance Program (CEAP/LIHEAP)",
    shortName: "CEAP/LIHEAP",
    tagline: "Helps pay heating and cooling bills. One-time payment sent directly to your utility company.",
    savingsRange: "$500 – $2,000/year in 2026",
    description: "Helps pay heating and cooling bills. One-time payment sent directly to your utility company.",
    intro: "The Texas Comprehensive Energy Assistance Program (CEAP), funded through the federal LIHEAP program, helps low-income Texas households pay their heating and cooling bills. Eligible families receive a one-time payment sent directly to their utility company, providing critical relief during extreme weather months. With Texas summers and winters putting strain on energy costs, this program helps vulnerable households keep the lights and air conditioning on.",
    eligibilityHighlights: [
      "Income below $1,995/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Confirm your household income is below $1,995/month (150% FPL). Priority goes to seniors 60+ and disabled households." },
      { step: 2, title: "Gather required documents", description: "Collect your most recent utility bill, proof of income for all household members, and a Texas photo ID." },
      { step: 3, title: "Download forms", description: "Download the Texas Energy Assistance Application from your local Community Action Agency or TDHCA website." },
      { step: 4, title: "Submit your application", description: "Apply through your local Community Action Agency. Funds are first-come, first-served, so apply early when the window opens." },
    ],
    forms: [
      { id: "texas-energy-application", name: "Texas Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.tdhca.state.tx.us/community-affairs/ceap/" },
    ],
    faqs: [
      {
        question: "What are the income limits to qualify for Texas CEAP energy assistance in 2026?",
        answer: "For a single-person household, the income limit for CEAP is $1,995 per month, which is 150% of the federal poverty level. The limit increases with each additional household member. Priority is given to households that include elderly members age 60 and older, people with disabilities, or families with children under the age of 6. All household members' income is counted when determining eligibility.",
      },
      {
        question: "When can I apply for Texas CEAP and how long does it take to get help?",
        answer: "Application periods vary by region because CEAP is administered through local Community Action Agencies across Texas, so you need to contact your local agency to find out when they are accepting applications. Funds are limited and distributed on a first-come, first-served basis, meaning the program often runs out of money before everyone who qualifies can be served. It is best to apply as early as possible when your local agency opens its application window. Processing times also vary by agency, but once approved, payment is sent directly to your utility company.",
      },
      {
        question: "Does Texas CEAP pay my electric bill directly or give me cash for energy costs?",
        answer: "CEAP provides a one-time payment that is sent directly to your utility company, not to you personally. The program covers both heating and cooling costs, which is especially important in Texas where summer electricity bills can spike due to extreme heat. It is not an ongoing monthly benefit, so the single payment is meant to help you get caught up or get ahead on your energy bills. The program generally cannot be used for propane tank purchases or to cover utility security deposits.",
      },
    ],
  },
  {
    id: "primary-home-care-community-care",
    name: "Primary Home Care (Community Care)",
    shortName: "Primary Home Care (Community",
    tagline: "Personal attendant services for Medicaid recipients who need help with daily activities at home.",
    savingsRange: "$1,000 – $5,000/year in 2026",
    description: "Personal attendant services for Medicaid recipients who need help with daily activities at home.",
    intro: "Primary Home Care through Texas Community Care provides personal attendant services to Medicaid recipients who need help with everyday activities like bathing, dressing, and meal preparation. This program allows Texans to receive the hands-on support they need while remaining in the comfort of their own home. It is a key part of Texas's commitment to keeping seniors and individuals with disabilities out of institutional care.",
    eligibilityHighlights: [
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "You must already be enrolled in Texas Medicaid and need help with daily activities like bathing or dressing." },
      { step: 2, title: "Gather required documents", description: "Have your Medicaid ID, doctor's statement of need, and proof of Texas residency ready for the assessment." },
      { step: 3, title: "Download forms", description: "Download the Texas Medicaid Application and HCBS Referral Form to request attendant care services." },
      { step: 4, title: "Submit your application", description: "Submit to Texas HHS and complete a functional needs assessment. A caseworker will determine your hours of care." },
    ],
    forms: [
      { id: "texas-medicaid-application", name: "Texas Medicaid Application", description: "Official Texas Medicaid application, required for waiver enrollment.", url: "https://www.yourtexasbenefits.com" },
      { id: "texas-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://www.yourtexasbenefits.com" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas", description: "Dallas, Collin, Denton counties" },
      { name: "Fort Worth", description: "Tarrant County" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
    ],
    serviceAreasHeading: "Primary Home Care Locations in Texas",
    faqs: [
      {
        question: "How many hours of Texas Primary Home Care can I get per week?",
        answer: "The number of hours you receive is determined by a functional needs assessment conducted by HHSC, not by a fixed schedule. Most participants receive between 6 and 30 hours per week depending on how much help they need with activities like bathing, dressing, and meal preparation. You must require a minimum of six hours per week to qualify for the program. Your hours can be adjusted over time if your needs change, and a reassessment is done periodically to make sure your service plan still fits.",
      },
      {
        question: "How long does it take to get approved for Texas Primary Home Care services?",
        answer: "The timeline has two main stages. First, you must be approved for Texas Medicaid through SSI, which typically takes three to five months to process. Once Medicaid eligibility is established, HHSC conducts a face-to-face assessment, and after that interview, the referral packet is sent to the service provider within five business days. The provider then receives authorization and actual service delivery can begin shortly after the referral is complete.",
      },
      {
        question: "What is the difference between Texas Primary Home Care and STAR+PLUS HCBS waiver services?",
        answer: "Texas Primary Home Care is a Medicaid entitlement program, meaning anyone who meets the eligibility criteria is guaranteed services with no waitlist. It focuses specifically on personal attendant services like bathing, dressing, grooming, meal preparation, and light housekeeping, all delivered by personal attendants rather than nurses. STAR+PLUS HCBS, by contrast, is a waiver program that requires a nursing facility level of care and offers a broader range of services including home modifications, adaptive aids, and respite care. PHC is also limited to the individual's own home, while STAR+PLUS allows services in settings like assisted living facilities.",
      },
    ],
  },
  {
    id: "texas-respite-care-services",
    name: "Texas Respite Care Services",
    shortName: "Respite Care",
    tagline: "Temporary relief for family caregivers. Someone else cares for your loved one so you can rest.",
    savingsRange: "$2,000 – $8,000/year in 2026",
    description: "Temporary relief for family caregivers. Someone else cares for your loved one so you can rest.",
    intro: "Texas Respite Care Services provide temporary relief to family caregivers by arranging for a trained substitute to look after their loved one. Whether you need a few hours to run errands or a longer break to recharge, respite care ensures your family member continues to receive quality attention. For the thousands of Texas families providing unpaid care to aging or disabled relatives, this program offers essential support to prevent caregiver burnout.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "You must be a primary caregiver for someone age 60+ or a grandparent raising a grandchild in Texas." },
      { step: 2, title: "Gather required documents", description: "Prepare your ID, the care recipient's medical information, and documentation of your caregiving role." },
      { step: 3, title: "Download forms", description: "Download the Family Caregiver Support Application through your local Area Agency on Aging." },
      { step: 4, title: "Submit your application", description: "Contact your local AAA to submit your application. A care coordinator will assess your needs and arrange services." },
    ],
    forms: [
      { id: "texas-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas / Fort Worth", description: "Dallas, Collin, Denton, Tarrant counties" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
      { name: "Corpus Christi", description: "Nueces County" },
    ],
    serviceAreasHeading: "Respite Care Locations in Texas",
    faqs: [
      {
        question: "Who is eligible for Texas respite care through the Area Agency on Aging?",
        answer: "Texas respite care through the National Family Caregiver Support Program is available to unpaid family caregivers who are at least 18 years old and caring for a loved one age 60 or older. The caregiver or care recipient must live within the service area of one of Texas' 28 Area Agencies on Aging, and the caregiver cannot receive payment for the care they provide. Grandparents and other relatives age 55 and older who are raising grandchildren under 18 may also qualify, with priority given to those caring for children with special needs. Caregivers of individuals with Alzheimer's disease or a related disorder may be eligible regardless of the care recipient's age.",
      },
      {
        question: "How do I apply for Texas respite care and how many hours can I get?",
        answer: "To apply, call 2-1-1 Texas (available 24 hours) to be connected with your local Area Agency on Aging, which administers the program in your region. Your local AAA will walk you through an eligibility screening and, if approved, work with you to arrange services. The number of hours or dollar amount you can receive varies by AAA. Some programs offer up to 32 hours of respite every three months, while others provide a one-time benefit of around $800 that can be used all at once or spread over a three-month period.",
      },
      {
        question: "How is Texas respite care different from regular home care services?",
        answer: "Texas respite care funded through the NFCSP is designed specifically to give temporary relief to unpaid family caregivers, not to serve as ongoing care for the recipient. Regular home care focuses on the daily needs of the person receiving care and is typically a long-term arrangement, while respite care provides short-term breaks so caregivers can rest, handle personal matters, or avoid burnout. Respite care is also more flexible in delivery, and can include an in-home aide, adult day care, or a short-term facility stay depending on the family's needs. Because its primary goal is caregiver wellbeing rather than long-term patient care, respite services are time-limited and meant to supplement the unpaid care a family member is already providing.",
      },
    ],
  },
  {
    id: "texas-meals-on-wheels",
    name: "Meals on Wheels Texas",
    shortName: "Home Meals",
    tagline: "Free or low-cost nutritious meals delivered to your home. Available to adults 60+ regardless of income.",
    savingsRange: "$1,500 – $3,600/year in 2026",
    description: "Free or low-cost nutritious meals delivered to your home. Available to adults 60+ regardless of income.",
    intro: "Meals on Wheels Texas delivers free or low-cost nutritious meals directly to the homes of older adults across the state. Available to Texans aged 60 and older regardless of income, the program also provides a daily wellness check through the delivery visit itself. For homebound seniors in Texas who may have difficulty cooking or shopping for groceries, Meals on Wheels is a trusted source of both nutrition and connection.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "You must be 60 or older and homebound or have difficulty preparing meals. There is no income requirement." },
      { step: 2, title: "Find your local provider", description: "Call 2-1-1 Texas or visit mealsonwheelstexas.org to find the Meals on Wheels provider in your area." },
      { step: 3, title: "Download forms", description: "Download the Senior Meals Program Referral form. A family member or doctor can also refer you directly." },
      { step: 4, title: "Complete your intake", description: "A staff member will call or visit to assess your needs. Meal delivery typically starts within 1 to 2 weeks." },
    ],
    forms: [
      { id: "texas-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Galveston, Montgomery, Liberty counties" },
      { name: "Dallas / Fort Worth", description: "Dallas, Collin, Tarrant, Erath counties" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin / Waco", description: "Travis, Williamson, McLennan counties" },
      { name: "El Paso", description: "El Paso County" },
      { name: "Corpus Christi / South Texas", description: "Nueces, Victoria, DeWitt, Goliad counties" },
      { name: "Lubbock / Amarillo", description: "Lubbock, Potter, Randall counties" },
      { name: "Tyler / Beaumont", description: "Smith, Jefferson counties" },
    ],
    serviceAreasHeading: "Meals on Wheels Locations in Texas",
    mapPins: [
      { label: "Meals on Wheels Houston", lat: 29.7604, lng: -95.3698 },
      { label: "Meals on Wheels Dallas", lat: 32.7767, lng: -96.7970 },
      { label: "Meals on Wheels San Antonio", lat: 29.4241, lng: -98.4936 },
      { label: "Meals on Wheels, Inc. of Tarrant County", lat: 32.8998, lng: -97.0403 },
      { label: "Meals on Wheels - Erath County", lat: 32.2174, lng: -98.2362 },
      { label: "Meals on Wheels Central Texas", lat: 30.6280, lng: -97.6781 },
      { label: "Meals on Wheels Waco", lat: 31.5493, lng: -97.1467 },
      { label: "Meals on Wheels Montgomery County", lat: 30.3138, lng: -95.4560 },
      { label: "Meals on Wheels South Texas", lat: 28.7041, lng: -97.8653 },
      { label: "Galveston Island Meals on Wheels", lat: 29.3013, lng: -94.7977 },
      { label: "Meals on Wheels El Paso", lat: 31.7619, lng: -106.4850 },
      { label: "Meals on Wheels Corpus Christi", lat: 27.8006, lng: -97.3964 },
      { label: "Meals on Wheels Lubbock", lat: 33.5779, lng: -101.8552 },
      { label: "Meals on Wheels Amarillo", lat: 35.2220, lng: -101.8313 },
      { label: "Meals on Wheels Tyler", lat: 32.3513, lng: -95.3011 },
      { label: "Meals on Wheels Beaumont", lat: 30.0802, lng: -94.1266 },
      { label: "Meals on Wheels Austin", lat: 30.2672, lng: -97.7431 },
      { label: "Meals on Wheels Fort Worth", lat: 32.7555, lng: -97.3308 },
    ],
    faqs: [
      {
        question: "Who is eligible for Meals on Wheels Texas and do you have to meet income requirements?",
        answer: "Meals on Wheels Texas programs generally serve adults age 60 and older who are homebound, have difficulty preparing meals on their own, and live within a local program's service area. Eligibility is based on need, not income. There are no income restrictions for most programs funded through the Texas Health and Human Services Commission and the Area Agencies on Aging. Disabled adults under 60 may also qualify depending on the local provider, and anyone can request a referral by calling 2-1-1 Texas or contacting their nearest Meals on Wheels program directly.",
      },
      {
        question: "How do I sign up for Meals on Wheels in Texas and how long does it take to start getting meals?",
        answer: "To sign up, call 2-1-1 Texas or contact your local Meals on Wheels provider, which you can find by entering your zip code at mealsonwheelstexas.org. A caseworker or assessment staff member will conduct a phone or in-home visit to determine eligibility, usually within a few business days of your request. The full intake and onboarding process typically takes one to two weeks, though some programs in high-demand areas like Austin or Dallas may take several weeks to complete.",
      },
      {
        question: "What does Meals on Wheels Texas provide besides food that makes it different from other meal delivery services?",
        answer: "Meals on Wheels Texas is not just a food delivery program. Volunteers perform a daily safety and wellness check at every meal drop-off, and for many homebound seniors, the volunteer may be the only person they interact with all day. Texas programs also offer wraparound services that vary by region, including home repairs, pet care assistance, durable medical equipment, transportation, and clinical care screenings. The entire network is coordinated through Texas Area Agencies on Aging and funded by federal dollars, state support through HHSC, and local donor contributions, with no cost to the recipient.",
      },
    ],
  },
  {
    id: "texas-pace-programs",
    name: "Texas PACE Programs",
    shortName: "Texas PACE Programs",
    tagline: "All-inclusive care centers in select Texas cities providing comprehensive medical and social services.",
    savingsRange: "$15,000 – $35,000/year in 2026",
    description: "All-inclusive care centers in select Texas cities providing comprehensive medical and social services.",
    intro: "Texas PACE Programs (Program of All-Inclusive Care for the Elderly) offer comprehensive medical and social services through dedicated care centers in select Texas cities. PACE coordinates everything from doctor visits and prescriptions to physical therapy and transportation, all under one roof. For older Texans who qualify for nursing home-level care but want to continue living at home, PACE provides a full continuum of support.",
    eligibilityHighlights: [
      "Age 55 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "You must be 55+, live in a PACE service area, and meet nursing home-level care criteria set by the State of Texas." },
      { step: 2, title: "Gather required documents", description: "Collect your Medicare and Medicaid cards, medical records, list of medications, and proof of Texas residency." },
      { step: 3, title: "Download forms", description: "Download the PACE Enrollment Application and Texas Medicaid Application if not already enrolled in Medicaid." },
      { step: 4, title: "Schedule your assessment", description: "Contact your nearest PACE center for a home visit. The interdisciplinary team will create your personalized care plan." },
    ],
    forms: [
      { id: "texas-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://www.yourtexasbenefits.com" },
      { id: "texas-medicaid-application", name: "Texas Medicaid Application", description: "Medicaid eligibility may be required. Apply through Texas's portal.", url: "https://www.yourtexasbenefits.com" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend counties" },
      { name: "Dallas / Fort Worth", description: "Dallas, Tarrant counties" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "El Paso", description: "El Paso County" },
      { name: "Amarillo", description: "Potter, Randall counties" },
      { name: "Austin", description: "Travis, Williamson counties" },
    ],
    serviceAreasHeading: "PACE Program Locations in Texas",
    faqs: [
      {
        question: "Can you keep your own doctor if you join Texas PACE?",
        answer: "When you enroll in Texas PACE, you will need to switch to a primary care doctor within the PACE organization. This is because the PACE model depends on a closely coordinated interdisciplinary care team that manages all of your medical services together. However, some PACE organizations may allow you to see a previous specialist on a limited basis if it is pre-authorized as part of your care plan. Your new PACE doctor or nurse practitioner specializes in the care of older adults and works alongside therapists, social workers, and other professionals dedicated to your health.",
      },
      {
        question: "Does Texas PACE cost anything if you only have Medicare and not Medicaid?",
        answer: "You do not need both Medicare and Medicaid to join Texas PACE, but the cost differs significantly depending on your coverage. Participants who qualify for both Medicare and Medicaid typically pay nothing out of pocket for PACE services, with no copays, deductibles, or lifetime limits on approved care. If you have Medicare only and do not qualify for Medicaid, you can still enroll but will be responsible for a monthly premium for the long-term care portion of PACE, which can run several thousand dollars per month, plus a separate premium for Medicare Part D prescription drug coverage.",
      },
      {
        question: "How is Texas PACE different from going to a nursing home or other Medicaid programs?",
        answer: "Texas PACE is designed specifically to keep people who qualify for nursing home placement living in their own communities instead. Unlike traditional Medicaid long-term care, PACE becomes the sole source of all Medicare and Medicaid benefits, bundling medical care, prescriptions, adult day services, transportation, and even dental and vision into one coordinated program. An interdisciplinary team at your local Texas PACE center creates a personalized care plan, and roughly 95% of participants continue living at home rather than in a facility. There is no copayment for participants who are dually eligible for Medicare and Medicaid.",
      },
    ],
  },
  {
    id: "texas-long-term-care-ombudsman",
    name: "Texas Long-Term Care Ombudsman",
    shortName: "LTC Ombudsman",
    tagline: "Free advocates who resolve complaints and protect the rights of people in nursing homes.",
    savingsRange: "$10,000 – $30,000/year in 2026",
    description: "Free advocates who resolve complaints and protect the rights of people in nursing homes.",
    intro: "The Texas Long-Term Care Ombudsman program provides free, trained advocates who investigate complaints and protect the rights of residents in nursing homes and assisted living facilities. If you or a loved one in Texas is experiencing issues with care quality, dignity, or safety in a long-term care setting, an ombudsman can step in to help resolve the problem. This program plays a critical role in ensuring that vulnerable Texans receive the standard of care they deserve.",
    eligibilityHighlights: [
      "Contact program for eligibility details",
    ],
    applicationSteps: [
      { step: 1, title: "Identify the issue", description: "This program is for residents of Texas nursing homes or assisted living facilities facing care, safety, or rights issues." },
      { step: 2, title: "Document your concerns", description: "Write down specific incidents including dates, staff involved, and any witnesses to the problems you have observed." },
      { step: 3, title: "Download forms", description: "Download the Ombudsman Complaint Form or call the Texas Ombudsman hotline at 1-800-458-9858 to file by phone." },
      { step: 4, title: "File your complaint", description: "Submit your complaint and a trained ombudsman advocate will investigate and work to resolve the issue confidentially." },
    ],
    forms: [
      { id: "texas-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
    faqs: [
      {
        question: "What types of complaints does the Texas Long-Term Care Ombudsman handle for nursing homes and assisted living?",
        answer: "The Texas Long-Term Care Ombudsman program, administered by Texas HHSC, covers residents of both nursing homes and assisted living facilities across the state. Ombudsmen can help with a wide range of concerns including care quality problems, residents' rights violations, involuntary discharge disputes, and billing issues. There are no income, age, or eligibility requirements to use the program. Anyone can contact the hotline at 1-800-458-9858, whether you are a resident, a family member, or a friend concerned about someone's care.",
      },
      {
        question: "What happens after you call the Texas Long-Term Care Ombudsman hotline to file a complaint?",
        answer: "When you call the Texas Long-Term Care Ombudsman hotline at 1-800-458-9858, your complaint is taken through a confidential process and assigned to a trained ombudsman in your area. The ombudsman will typically investigate by visiting the facility, speaking with the resident, and working with staff to resolve the concern. Texas HHSC administers the program statewide, so complaints are routed to the appropriate regional ombudsman regardless of where the facility is located. Resolution timelines vary depending on the complexity of the issue, but the ombudsman will keep you informed throughout the process.",
      },
      {
        question: "What is the difference between calling the Texas Long-Term Care Ombudsman versus Adult Protective Services or law enforcement?",
        answer: "The Texas Long-Term Care Ombudsman program is different because ombudsmen are trained advocates who work on behalf of residents, not regulators or law enforcement officers. While Adult Protective Services investigates abuse and neglect, and law enforcement handles criminal matters, ombudsmen focus on resolving a broader range of concerns like care quality, rights violations, discharge disputes, and billing problems through advocacy and mediation. The program offers a confidential complaint process and ombudsmen can often resolve issues without formal legal or regulatory action. In serious cases an ombudsman can also help you understand when involving APS or law enforcement may be appropriate.",
      },
    ],
  },
  {
    id: "texas-weatherization-assistance-program",
    name: "Texas Weatherization Assistance Program",
    shortName: "Weatherization",
    tagline: "Free home improvements to reduce energy costs including insulation, weather stripping, and furnace repair.",
    savingsRange: "$500 – $2,000/year in 2026",
    description: "Free home improvements to reduce energy costs including insulation, weather stripping, and furnace repair.",
    intro: "The Texas Weatherization Assistance Program provides free home improvements — such as insulation, weather stripping, and furnace repairs — designed to lower energy costs for low-income households. By making homes more energy efficient, the program helps Texas families save money on utility bills year-round while also improving comfort and safety. Priority is given to seniors, people with disabilities, and families with young children.",
    eligibilityHighlights: [
      "Income below $2,660/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Confirm your household income is below $2,660/month (200% FPL). Seniors 60+ and disabled households get priority." },
      { step: 2, title: "Gather required documents", description: "Collect proof of income, your utility bills, Texas ID, and landlord permission if you are a renter." },
      { step: 3, title: "Download forms", description: "Download the Weatherization Application from your local subrecipient agency assigned by TDHCA." },
      { step: 4, title: "Submit and schedule audit", description: "Apply through your local agency. A certified energy auditor will evaluate your home to determine needed improvements." },
    ],
    forms: [
      { id: "texas-energy-application", name: "Texas Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.tdhca.state.tx.us/community-affairs/ceap/" },
    ],
    faqs: [
      {
        question: "What are the income limits for Texas Weatherization Assistance Program in 2026?",
        answer: "To qualify for the Texas Weatherization Assistance Program in 2026, your household income must be at or below 200% of the federal poverty level. For a single person, that means earning no more than $2,660 per month. The program gives priority to elderly residents age 60 and older, people with disabilities, and families with children under 6. You can apply through your local subrecipient agency, which is assigned by the Texas Department of Housing and Community Affairs (TDHCA).",
      },
      {
        question: "How long is the waitlist for Texas Weatherization Assistance?",
        answer: "Wait times for the Texas Weatherization Assistance Program vary significantly by location, ranging from 6 months to over 2 years in some areas. Once you reach the top of the list, a certified energy auditor will evaluate your home to determine which improvements will have the greatest impact on your energy use. The actual weatherization work typically includes things like adding insulation, sealing air leaks, and repairing or replacing heating and cooling systems. The average value of the work performed is between $4,000 and $7,000 per home, all provided at no cost to qualifying households.",
      },
      {
        question: "What does Texas Weatherization Assistance do and how is it different from CEAP energy bill help?",
        answer: "The Texas Weatherization Assistance Program provides free physical improvements to your home, such as insulation, weather stripping, caulking, window repairs, and furnace or AC repair or replacement, all aimed at making your home more energy efficient. This is different from CEAP (the Comprehensive Energy Assistance Program), which helps pay your current utility bills but does not fix the underlying problems causing high energy costs. Weatherization addresses the root cause by reducing how much energy your home wastes, which lowers your bills long term. Both homeowners and renters can qualify, though renters will need their landlord's written permission before work can begin.",
      },
    ],
  },
  {
    id: "texas-legal-services-for-seniors",
    name: "Texas Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Free legal help for seniors 60+ on issues like benefits denials, housing disputes, and elder abuse.",
    savingsRange: "$500 – $3,000/year in 2026",
    description: "Free legal help for seniors 60+ on issues like benefits denials, housing disputes, and elder abuse.",
    intro: "Texas Legal Services for Seniors provides free legal assistance to Texans aged 60 and older who are facing issues such as benefits denials, housing disputes, consumer fraud, and elder abuse. Experienced attorneys and legal aid workers help seniors navigate the legal system without the burden of costly fees. This program ensures that older adults in Texas have access to justice when they need it most.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "You must be 60 or older and live in Texas. There is no income requirement for this free legal service." },
      { step: 2, title: "Gather your documents", description: "Collect any letters, notices, contracts, or court documents related to your legal issue before your consultation." },
      { step: 3, title: "Download forms", description: "Download the Senior Legal Services Intake Form or call your local legal aid office to start your case by phone." },
      { step: 4, title: "Meet with an attorney", description: "A legal aid attorney will review your case and provide free advice, representation, or referrals as needed." },
    ],
    forms: [
      { id: "texas-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas", description: "Dallas, Collin, Denton counties" },
      { name: "Fort Worth", description: "Tarrant County" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
    ],
    serviceAreasHeading: "Senior Legal Services Locations in Texas",
    faqs: [
      {
        question: "Who is eligible for Texas Legal Services for Seniors?",
        answer: "Texas Legal Services for Seniors is available to any Texas resident aged 60 or older. There is no income requirement to qualify, making it accessible regardless of financial status. However, priority is given to individuals with the greatest economic or social need, including those who are low-income, minority, or living in rural areas. The program is funded through the Older Americans Act and delivered through Area Agencies on Aging and local legal aid organizations across the state.",
      },
      {
        question: "How do I apply for Texas Legal Services for Seniors and how long does it take to get help?",
        answer: "To get started, contact your local Area Agency on Aging or a legal aid organization in your area that participates in the program. After an initial intake screening to confirm your age and understand your legal issue, you may receive services ranging from legal advice over the phone to brief services like drafting a letter or reviewing a document. In some cases, an attorney may provide direct representation. Wait times vary by region and demand, but many programs aim to respond within a few business days of your initial request.",
      },
      {
        question: "What types of cases does Texas Legal Services for Seniors handle and what cases are excluded?",
        answer: "Texas Legal Services for Seniors focuses on civil legal matters that commonly affect older adults, including benefits denials, housing disputes, consumer fraud, elder abuse, and guardianship issues. Attorneys can provide legal advice, help with paperwork, negotiate on your behalf, and in certain situations represent you in court. The program does not typically handle criminal cases or fee-generating cases such as personal injury lawsuits, since those cases can be taken by private attorneys on a contingency basis. This focus on civil matters allows the program to direct its limited resources toward legal problems where seniors would otherwise have no access to representation.",
      },
    ],
  },
  {
    id: "texas-senior-companion-program",
    name: "Texas Senior Companion Program",
    shortName: "Texas Senior Companion Program",
    tagline: "Trained volunteers visit seniors who are homebound to provide companionship and light assistance.",
    savingsRange: "$2,000 – $8,000/year in 2026",
    description: "Trained volunteers visit seniors who are homebound to provide companionship and light assistance.",
    intro: "The Texas Senior Companion Program pairs trained volunteers with homebound seniors to provide regular companionship and light assistance with daily tasks. Volunteers visit on a consistent schedule, offering social connection that helps reduce isolation and improve well-being. For older Texans living alone, the Senior Companion Program provides meaningful human interaction and a reassuring presence.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Clients must be 60+ and homebound or socially isolated. Volunteers must be 55+ and meet income guidelines." },
      { step: 2, title: "Contact your local program", description: "Call 2-1-1 Texas or your nearest AmeriCorps Seniors office to request a companion or sign up to volunteer." },
      { step: 3, title: "Download forms", description: "Download the program application. Volunteers will need to complete a background check and orientation training." },
      { step: 4, title: "Get matched", description: "A coordinator will match you with a companion based on location, schedule, and interests. Visits start within 2 to 4 weeks." },
    ],
    forms: [
      { id: "texas-scsep-application", name: "Senior Employment Program Application", description: "Apply for part-time community service job training for low-income seniors aged 55+.", url: "https://www.dol.gov/agencies/eta/seniors" },
    ],
    serviceAreas: [
      { name: "Houston", description: "Harris, Fort Bend, Montgomery counties" },
      { name: "Dallas / Fort Worth", description: "Dallas, Collin, Denton, Tarrant counties" },
      { name: "San Antonio", description: "Bexar County" },
      { name: "Austin", description: "Travis, Williamson counties" },
      { name: "El Paso", description: "El Paso County" },
      { name: "Corpus Christi / Rio Grande Valley", description: "Nueces, Hidalgo, Cameron, Willacy counties" },
      { name: "Lubbock / South Plains", description: "Lubbock, Hockley counties" },
      { name: "Midland / Odessa", description: "Midland, Ector counties" },
    ],
    serviceAreasHeading: "Senior Companion Program Locations in Texas",
    faqs: [
      {
        question: "What are the income and age requirements to volunteer for the Texas Senior Companion Program?",
        answer: "To volunteer, you must be age 55 or older and meet federal income guidelines, which are set at or below 200% of the federal poverty level, in order to receive the stipend. The program is part of AmeriCorps Seniors (formerly Senior Corps), so eligibility follows federal guidelines. Clients who receive visits must be age 60 or older and be homebound or socially isolated, but there is no income requirement for clients.",
      },
      {
        question: "How many hours do you have to volunteer for the Texas Senior Companion Program?",
        answer: "Senior Companions commit to serving between 15 and 40 hours per week visiting and assisting older adults in their community. In return for this time commitment, volunteers receive a small tax-free stipend, mileage reimbursement, and meals during their service hours. Most local program offices will work with you on scheduling, and the matching process pairs you with a client based on location, availability, and shared interests.",
      },
      {
        question: "Is the Texas Senior Companion Program free and how is it different from home care?",
        answer: "The program is completely free to the older adults who receive visits. Unlike home care or home health services, Senior Companions do not provide medical care, personal care, or clinical support. Instead, they offer friendship, conversation, and light assistance such as help with errands or accompaniment to appointments. It is a volunteer-driven program focused on reducing isolation rather than delivering professional caregiving.",
      },
    ],
  },
  {
    id: "senior-community-service-employment-program-scsep",
    name: "Senior Community Service Employment Program (SCSEP)",
    shortName: "SCSEP",
    tagline: "Paid job training for low-income seniors 55+. Work at community organizations while learning skills.",
    savingsRange: "$3,000 – $8,000/year in 2026",
    description: "Paid job training for low-income seniors 55+. Work at community organizations while learning skills.",
    intro: "The Senior Community Service Employment Program (SCSEP) in Texas offers paid, part-time job training for low-income adults aged 55 and older who want to re-enter the workforce. Participants work at local community organizations — such as schools, hospitals, and nonprofits — while building new skills and earning income. SCSEP gives older Texans a path back to employment with the training and support they need to succeed.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1,663/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "You must be 55+ with household income below $1,663/month and unemployed or looking for work in Texas." },
      { step: 2, title: "Gather required documents", description: "Bring your Texas ID, Social Security card, proof of income, and employment history to your intake appointment." },
      { step: 3, title: "Download forms", description: "Download the Senior Employment Program Application or contact your local SCSEP grantee to apply in person." },
      { step: 4, title: "Start training", description: "Once accepted, you will be placed at a local community organization for paid, part-time job training (20 hours/week)." },
    ],
    forms: [
      { id: "texas-scsep-application", name: "Senior Employment Program Application", description: "Apply for part-time community service job training for low-income seniors aged 55+.", url: "https://www.dol.gov/agencies/eta/seniors" },
    ],
    faqs: [
      {
        question: "Who is eligible for SCSEP in Texas and what are the income requirements?",
        answer: "To qualify for the Senior Community Service Employment Program in Texas, you must be at least 55 years old, currently unemployed, and authorized to work in the United States. Your household income must be at or below 125% of the federal poverty level, which for a single person in 2026 is approximately $1,663 per month ($19,950 annually). Priority enrollment is given to individuals who are 65 or older, veterans, and those who were unsuccessful finding employment through a WIOA program. You can contact your county SCSEP representative through the Texas Workforce Commission or a national grantee like AARP Foundation.",
      },
      {
        question: "How long can you stay in the SCSEP program and how many hours do you work?",
        answer: "SCSEP participants in Texas typically train for one to two years, though the program allows up to a 48-month (four-year) lifetime limit on participation. During training, participants work approximately 20 hours per week at nonprofit organizations, school districts, or government agencies and are paid the highest applicable minimum wage. Extensions beyond the typical timeline may be granted on a case-by-case basis depending on the participant's progress toward unsubsidized employment. The goal is to transition participants into permanent jobs in the public or private sector once their training is complete.",
      },
      {
        question: "What makes SCSEP different from other job training programs for seniors in Texas?",
        answer: "SCSEP is the only federally funded job training program in the United States designed exclusively for low-income adults aged 55 and older, making it unique among workforce development programs. Unlike other training programs, SCSEP places participants directly into paid community service assignments at nonprofits and public agencies, so they earn income while building skills rather than attending classroom-only instruction. In Texas, the program is administered by TWC alongside national grantees such as AARP Foundation, Goodwill Industries, SER National, and National Able Network. The program also provides wraparound assistance like help with transportation, work clothing, health checkups, and GED preparation.",
      },
    ],
  },
];

// ─── Utah ────────────────────────────────────────────────────────────────────────

const utahPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-blind-or-disabled",
    name: "Medicaid for Aged, Blind or Disabled",
    shortName: "ABD Medicaid",
    tagline: "Medical assistance program for individuals aged 65+ or older, blind, or disabled with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Medical assistance program for individuals aged 65+ or older, blind, or disabled with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1255/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "utah-medicaid-application", name: "Utah Medicaid Application", description: "Official Utah Medicaid application. Apply online or download a printable form.", url: "https://jobs.utah.gov/mycase/" },
    ],
  },
  {
    id: "aging-waiver-home-and-community-based-services",
    name: "Aging Waiver (Home and Community Based Services)",
    shortName: "Aging Waiver (Home and",
    tagline: "Medicaid waiver program for seniors 65+ who would be medically appropriate for nursing facility placement.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver program for seniors 65+ who would be medically appropriate for nursing facility placement.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1255/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "utah-medicaid-application", name: "Utah Medicaid Application", description: "Official Utah Medicaid application, required for waiver enrollment.", url: "https://jobs.utah.gov/mycase/" },
      { id: "utah-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://jobs.utah.gov/mycase/" },
    ],
  },
  {
    id: "medicaid-expansion",
    name: "Medicaid Expansion",
    shortName: "Medicaid Expansion",
    tagline: "Extended Medicaid eligibility to Utah adults whose annual income is up to 138% of the federal poverty level.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Extended Medicaid eligibility to Utah adults whose annual income is up to 138% of the federal poverty level.",
    eligibilityHighlights: [
      "Income below $1467/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "utah-medicaid-application", name: "Utah Medicaid Application", description: "Official Utah Medicaid application. Apply online or download a printable form.", url: "https://jobs.utah.gov/mycase/" },
    ],
  },
  {
    id: "new-choices-waiver",
    name: "New Choices Waiver",
    shortName: "New Choices Waiver",
    tagline: "Medicaid waiver program for individuals in nursing facilities who want to transition to community settings.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver program for individuals in nursing facilities who want to transition to community settings.",
    eligibilityHighlights: [
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "utah-medicaid-application", name: "Utah Medicaid Application", description: "Official Utah Medicaid application, required for waiver enrollment.", url: "https://jobs.utah.gov/mycase/" },
      { id: "utah-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://jobs.utah.gov/mycase/" },
    ],
  },
  {
    id: "physical-disabilities-waiver",
    name: "Physical Disabilities Waiver",
    shortName: "Physical Disabilities Waiver",
    tagline: "Medicaid waiver program providing services to help people with physical disabilities live independently.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver program providing services to help people with physical disabilities live independently.",
    eligibilityHighlights: [
      "Income below $1255/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "utah-medicaid-application", name: "Utah Medicaid Application", description: "Official Utah Medicaid application, required for waiver enrollment.", url: "https://jobs.utah.gov/mycase/" },
      { id: "utah-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://jobs.utah.gov/mycase/" },
    ],
  },
];

// ─── Vermont ─────────────────────────────────────────────────────────────────────

const vermontPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-the-aged-blind-and-disabled-mabd",
    name: "Medicaid for the Aged, Blind and Disabled (MABD)",
    shortName: "MABD",
    tagline: "Provides health coverage including long-term care services for low-income seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides health coverage including long-term care services for low-income seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1333/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-medicaid-application", name: "Vermont Medicaid Application", description: "Official Vermont Medicaid application. Apply online or download a printable form.", url: "https://vermontbenefits.gov" },
    ],
  },
  {
    id: "choices-for-care-hcbs-waiver",
    name: "Choices for Care HCBS Waiver",
    shortName: "Choices for Care HCBS Waiver",
    tagline: "Medicaid waiver providing home and community-based services to seniors requiring nursing home level of care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid waiver providing home and community-based services to seniors requiring nursing home level of care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-medicaid-application", name: "Vermont Medicaid Application", description: "Official Vermont Medicaid application, required for waiver enrollment.", url: "https://vermontbenefits.gov" },
      { id: "vermont-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://vermontbenefits.gov" },
    ],
  },
  {
    id: "medicare-savings-programs-qmb-slmb-qi",
    name: "Medicare Savings Programs (QMB/SLMB/QI)",
    shortName: "QMB/SLMB/QI",
    tagline: "State programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State programs that help low-income Medicare beneficiaries pay for premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1333/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://vermontbenefits.gov" },
    ],
  },
  {
    id: "3squares-vermont-snap",
    name: "3Squares Vermont (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits to low-income households to purchase nutritious food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits to low-income households to purchase nutritious food.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1924/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-snap-application", name: "Vermont SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dcf.vermont.gov/benefits/3SquaresVT" },
    ],
  },
  {
    id: "state-ssi-supplement-essential-person-benefit",
    name: "State SSI Supplement (Essential Person Benefit)",
    shortName: "SSI Supplement",
    tagline: "Provides state supplement to federal SSI for aged, blind, and disabled individuals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Provides state supplement to federal SSI for aged, blind, and disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $914/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "vermont-ssi-supplement", name: "Vermont SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://vermontbenefits.gov" },
    ],
  },
  {
    id: "general-assistance-fuel",
    name: "General Assistance Fuel",
    shortName: "General Assistance Fuel",
    tagline: "Vermont's LIHEAP program provides financial assistance to eligible low-income households for heating costs.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Vermont's LIHEAP program provides financial assistance to eligible low-income households for heating costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3095/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-medicaid-application", name: "Vermont Medicaid Application", description: "Official Vermont Medicaid application. Apply online or download a printable form.", url: "https://vermontbenefits.gov" },
    ],
  },
  {
    id: "property-tax-adjustment-renter-property-tax-credit",
    name: "Property Tax Adjustment (Renter/Property Tax Credit)",
    shortName: "Property Tax Relief",
    tagline: "Provides income-based credits to seniors for property taxes or rent paid.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides income-based credits to seniors for property taxes or rent paid.",
    eligibilityHighlights: [
      "Age 62 or older",
      "Income below $47000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-property-tax-application", name: "Vermont Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://vermontbenefits.gov" },
    ],
  },
  {
    id: "health-care-navigator-ship",
    name: "Health Care Navigator (SHIP)",
    shortName: "SHIP",
    tagline: "Free counseling and assistance for Medicare beneficiaries on plan choices, appeals, and enrollment.",
    savingsRange: "Free counseling service",
    description: "Free counseling and assistance for Medicare beneficiaries on plan choices, appeals, and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, counseling, training, and supplies for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, counseling, training, and supplies for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3095/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-services-for-older-vermonters",
    name: "Legal Services for Older Vermonters",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors on issues like benefits, housing, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors on issues like benefits, housing, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3095/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors who can't prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors who can't prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "vermont-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Virginia ────────────────────────────────────────────────────────────────────

const virginiaPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-aged-blind-or-disabled-abd",
    name: "Medicaid for Aged, Blind, or Disabled (ABD)",
    shortName: "ABD",
    tagline: "Provides full Medicaid benefits including doctor visits, hospital care, and long-term care services.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides full Medicaid benefits including doctor visits, hospital care, and long-term care services.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1781/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-medicaid-application", name: "Virginia Medicaid Application", description: "Official Virginia Medicaid application. Apply online or download a printable form.", url: "https://commonhelp.virginia.gov" },
    ],
  },
  {
    id: "medicare-savings-programs-qmb-slmb-qi",
    name: "Medicare Savings Programs (QMB, SLMB, QI)",
    shortName: "Medicare Savings",
    tagline: "State programs that help low-income Medicare beneficiaries pay for Medicare premiums and costs.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State programs that help low-income Medicare beneficiaries pay for Medicare premiums and costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1781/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://commonhelp.virginia.gov" },
    ],
  },
  {
    id: "commonwealth-coordinated-care-plus-ccc-plus-waiver",
    name: "Commonwealth Coordinated Care Plus (CCC Plus) Waiver",
    shortName: "Commonwealth Coordinated Care",
    tagline: "Medicaid home and community-based services (HCBS) waiver providing long-term care at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Medicaid home and community-based services (HCBS) waiver providing long-term care at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1781/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-medicaid-application", name: "Virginia Medicaid Application", description: "Official Virginia Medicaid application, required for waiver enrollment.", url: "https://commonhelp.virginia.gov" },
      { id: "virginia-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://commonhelp.virginia.gov" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Provides monthly benefits via EBT card to purchase nutritious food for eligible seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides monthly benefits via EBT card to purchase nutritious food for eligible seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1980/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-snap-application", name: "Virginia SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://commonhelp.virginia.gov" },
    ],
  },
  {
    id: "program-of-all-inclusive-care-for-the-elderly-pace",
    name: "Program of All-Inclusive Care for the Elderly (PACE)",
    shortName: "PACE",
    tagline: "Comprehensive program providing all Medicare and Medicaid services plus additional support.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Comprehensive program providing all Medicare and Medicaid services plus additional support.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $1781/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://commonhelp.virginia.gov" },
      { id: "virginia-medicaid-application", name: "Virginia Medicaid Application", description: "Medicaid eligibility may be required. Apply through Virginia's portal.", url: "https://commonhelp.virginia.gov" },
    ],
  },
  {
    id: "virginia-insurance-counseling-and-assistance-program-vicap",
    name: "Virginia Insurance Counseling and Assistance Program (VICAP)",
    shortName: "VICAP",
    tagline: "State Health Insurance Assistance Program (SHIP) offering free, unbiased counseling on Medicare.",
    savingsRange: "$3,000 – $10,000/year",
    description: "State Health Insurance Assistance Program (SHIP) offering free, unbiased counseling on Medicare.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "low-income-home-energy-assistance-program-liheap",
    name: "Low-Income Home Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Assists eligible low-income households, including seniors, with heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Assists eligible low-income households, including seniors, with heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2355/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-energy-application", name: "Virginia Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.dss.virginia.gov/benefit/ea/" },
    ],
  },
  {
    id: "virginia-family-caregiver-support-program",
    name: "Virginia Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $32500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "virginia-long-term-care-ombudsman-program",
    name: "Virginia Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities including nursing homes and assisted living.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "virginia-home-delivered-meals-program",
    name: "Virginia Home-Delivered Meals Program",
    shortName: "Home Meals",
    tagline: "Delivers nutritious meals to homebound seniors 60+ who can't prepare their own meals.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Delivers nutritious meals to homebound seniors 60+ who can't prepare their own meals.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "virginia-property-tax-exemption-for-elderly-disabled",
    name: "Virginia Property Tax Exemption for Elderly/Disabled",
    shortName: "Property Tax Relief",
    tagline: "Provides partial property tax relief for homeowners 65+ or disabled with income limits.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides partial property tax relief for homeowners 65+ or disabled with income limits.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $50000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-property-tax-application", name: "Virginia Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://commonhelp.virginia.gov" },
    ],
  },
  {
    id: "virginia-senior-citizens-law-project",
    name: "Virginia Senior Citizens Law Project",
    shortName: "Virginia Senior Citizens Law",
    tagline: "Provides free legal services to low-income seniors 60+ on issues like benefits, housing, and elder abuse.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Provides free legal services to low-income seniors 60+ on issues like benefits, housing, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2355/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "virginia-medicaid-application", name: "Virginia Medicaid Application", description: "Official Virginia Medicaid application. Apply online or download a printable form.", url: "https://commonhelp.virginia.gov" },
    ],
  },
];

// ─── Washington ──────────────────────────────────────────────────────────────────

const washingtonPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "Provides healthcare and long-term care services to financially limited Washington seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides healthcare and long-term care services to financially limited Washington seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-medicaid-application", name: "Washington Medicaid Application", description: "Official Washington Medicaid application. Apply online or download a printable form.", url: "https://www.washingtonconnection.org" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Helps low-income Medicare beneficiaries pay for premiums, deductibles, and coinsurance.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://www.washingtonconnection.org" },
    ],
  },
  {
    id: "basic-food-program",
    name: "Basic Food Program",
    shortName: "SNAP/Food",
    tagline: "Washington's SNAP program providing monthly benefits to buy food for low-income households.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Washington's SNAP program providing monthly benefits to buy food for low-income households.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2212/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-snap-application", name: "Washington SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://www.washingtonconnection.org" },
    ],
  },
  {
    id: "tailored-supports-for-older-adults",
    name: "Tailored Supports for Older Adults",
    shortName: "Tailored Supports for Older",
    tagline: "HCBS waiver providing long-term care services at home for adults 55+ needing nursing facility level of care.",
    savingsRange: "$1,000 – $5,000/year",
    description: "HCBS waiver providing long-term care services at home for adults 55+ needing nursing facility level of care.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2901/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-medicaid-application", name: "Washington Medicaid Application", description: "Official Washington Medicaid application. Apply online or download a printable form.", url: "https://www.washingtonconnection.org" },
    ],
  },
  {
    id: "washington-state-health-insurance-assistance-program",
    name: "Washington State Health Insurance Assistance Program",
    shortName: "Washington State Health",
    tagline: "Free counseling and assistance for Medicare beneficiaries and caregivers on Medicare options.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries and caregivers on Medicare options.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-medicaid-application", name: "Washington Medicaid Application", description: "Official Washington Medicaid application. Apply online or download a printable form.", url: "https://www.washingtonconnection.org" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "washington-energy-assistance-program",
    name: "Washington Energy Assistance Program",
    shortName: "Energy Assistance",
    tagline: "Provides one-time energy assistance grants to low-income households to pay heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Provides one-time energy assistance grants to low-income households to pay heating and cooling costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3095/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-energy-application", name: "Washington Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://www.commerce.wa.gov/growing-the-economy/energy/low-income-home-energy-assistance/" },
    ],
  },
  {
    id: "senior-legal-services",
    name: "Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Free legal assistance for low-income seniors 60+ on public benefits, housing, and consumer issues.",
    savingsRange: "$500 – $3,000/year",
    description: "Free legal assistance for low-income seniors 60+ on public benefits, housing, and consumer issues.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "family-caregiver-support-program",
    name: "Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Support services for family caregivers of seniors 60+ including respite care, training, and counseling.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Support services for family caregivers of seniors 60+ including respite care, training, and counseling.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors 60+ who can't prepare their own food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors 60+ who can't prepare their own food.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "washington-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── West Virginia ───────────────────────────────────────────────────────────────

const westVirginiaPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "West Virginia's ABD Medicaid provides healthcare and long-term care services for seniors 65+.",
    savingsRange: "$5,000 – $20,000/year",
    description: "West Virginia's ABD Medicaid provides healthcare and long-term care services for seniors 65+.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-medicaid-application", name: "West Virginia Medicaid Application", description: "Official West Virginia Medicaid application. Apply online or download a printable form.", url: "https://dhhr.wv.gov/bms/Pages/Apply-For-Medicaid.aspx" },
    ],
  },
  {
    id: "aged-and-disabled-waiver-adw",
    name: "Aged and Disabled Waiver (ADW)",
    shortName: "ADW",
    tagline: "West Virginia's Aged and Disabled Waiver provides home and community-based services at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "West Virginia's Aged and Disabled Waiver provides home and community-based services at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-medicaid-application", name: "West Virginia Medicaid Application", description: "Official West Virginia Medicaid application, required for waiver enrollment.", url: "https://dhhr.wv.gov/bms/Pages/Apply-For-Medicaid.aspx" },
      { id: "west-virginia-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dhhr.wv.gov/bms/Pages/Apply-For-Medicaid.aspx" },
    ],
  },
  {
    id: "medicare-savings-program",
    name: "Medicare Savings Program",
    shortName: "Medicare Savings",
    tagline: "West Virginia's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "West Virginia's Medicare Savings Programs (QMB, SLMB, QI) help low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://dhhr.wv.gov/bms/Pages/Apply-For-Medicaid.aspx" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "West Virginia's SNAP provides monthly benefits via EBT card to buy healthy food.",
    savingsRange: "$1,500 – $3,600/year",
    description: "West Virginia's SNAP provides monthly benefits via EBT card to buy healthy food.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1922/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-snap-application", name: "West Virginia SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dhhr.wv.gov/bcf/Services/Pages/SNAP.aspx" },
    ],
  },
  {
    id: "low-income-energy-assistance-program-lieap",
    name: "Low-Income Energy Assistance Program (LIEAP)",
    shortName: "LIEAP",
    tagline: "West Virginia's LIEAP provides one-time payments to help low-income households with energy costs.",
    savingsRange: "$500 – $2,000/year",
    description: "West Virginia's LIEAP provides one-time payments to help low-income households with energy costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2811/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-energy-application", name: "West Virginia Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dhhr.wv.gov/bcf/Services/Pages/LIEAP.aspx" },
    ],
  },
  {
    id: "west-virginia-senior-medicare-patrol-smp",
    name: "West Virginia Senior Medicare Patrol (SMP)",
    shortName: "SMP",
    tagline: "Free counseling and education on Medicare rights, coverage, and fraud prevention.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free counseling and education on Medicare rights, coverage, and fraud prevention.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-smp-referral", name: "Senior Medicare Patrol Volunteer/Referral Form", description: "Report suspected Medicare fraud, errors, or abuse, or volunteer as a counselor.", url: "https://www.smpresource.org" },
    ],
  },
  {
    id: "west-virginia-long-term-care-ombudsman-program",
    name: "West Virginia Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents in long-term care facilities, investigating complaints and protecting rights.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents in long-term care facilities, investigating complaints and protecting rights.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors 60+ through local area agencies.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors 60+ through local area agencies.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, caregiver training, and counseling for family caregivers.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "legal-services-senior-legal-services",
    name: "Legal Services Senior Legal Services",
    shortName: "Senior Legal Aid",
    tagline: "Provides free civil legal assistance to low-income seniors 60+ on benefits, housing, and elder abuse.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free civil legal assistance to low-income seniors 60+ on benefits, housing, and elder abuse.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2070/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "west-virginia-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Wisconsin ───────────────────────────────────────────────────────────────────

const wisconsinPrograms: WaiverProgram[] = [
  {
    id: "medicaid-for-the-elderly-blind-or-disabled",
    name: "Medicaid for the Elderly, Blind, or Disabled",
    shortName: "Medicaid for the Elderly,",
    tagline: "Provides health care benefits to low-income Wisconsin residents who are 65+, blind, or disabled.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Provides health care benefits to low-income Wisconsin residents who are 65+, blind, or disabled.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1050/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-medicaid-application", name: "Wisconsin Medicaid Application", description: "Official Wisconsin Medicaid application. Apply online or download a printable form.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "family-care-iris-and-partnership-waivers",
    name: "Family Care IRIS and Partnership Waivers",
    shortName: "Family Care IRIS and",
    tagline: "Home and community-based services Medicaid waivers providing long-term care at home.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waivers providing long-term care at home.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1300/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "foodshare",
    name: "FoodShare",
    shortName: "SNAP/Food",
    tagline: "Wisconsin's SNAP/food assistance program providing monthly benefits to low-income seniors.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Wisconsin's SNAP/food assistance program providing monthly benefits to low-income seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1981/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-snap-application", name: "Wisconsin SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "wisconsin-pace-program",
    name: "Wisconsin PACE Program",
    shortName: "Wisconsin PACE Program",
    tagline: "Program of All-Inclusive Care for the Elderly providing comprehensive medical and support services.",
    savingsRange: "$15,000 – $35,000/year",
    description: "Program of All-Inclusive Care for the Elderly providing comprehensive medical and support services.",
    eligibilityHighlights: [
      "Age 55 or older",
      "Income below $2901/month",
      "Must meet disability requirements",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-pace-enrollment", name: "PACE Enrollment Application", description: "Enroll in the Program of All-Inclusive Care for the Elderly for comprehensive medical and support services.", url: "https://access.wisconsin.gov" },
      { id: "wisconsin-medicaid-application", name: "Wisconsin Medicaid Application", description: "Medicaid eligibility may be required. Apply through Wisconsin's portal.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "wisconsin-ship-senior-health-insurance-assistance-program",
    name: "Wisconsin SHIP (Senior Health Insurance Assistance Program)",
    shortName: "Wisconsin SHIP (Senior Health",
    tagline: "Free counseling and assistance for Medicare beneficiaries on coverage options and appeals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "Free counseling and assistance for Medicare beneficiaries on coverage options and appeals.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "wisconsin-seniorcare",
    name: "Wisconsin SeniorCare",
    shortName: "Wisconsin SeniorCare",
    tagline: "State Pharmaceutical Assistance Program providing prescription drug coverage for seniors.",
    savingsRange: "$1,000 – $5,000/year",
    description: "State Pharmaceutical Assistance Program providing prescription drug coverage for seniors.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2825/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-pharmacy-application", name: "Wisconsin Prescription Assistance Application", description: "Apply for state pharmaceutical assistance to help cover prescription drug costs.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "wisconsin-home-energy-assistance-program-wheap",
    name: "Wisconsin Home Energy Assistance Program (WHEAP)",
    shortName: "WHEAP",
    tagline: "Helps eligible low-income households, including seniors, pay for home heating and cooling costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps eligible low-income households, including seniors, pay for home heating and cooling costs.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2620/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-energy-application", name: "Wisconsin Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://energyandhousing.wi.gov/Pages/AgenciesAndAssistance/EnergyAssistance.aspx" },
    ],
  },
  {
    id: "wisconsin-property-tax-relief-circuit-breaker-credit",
    name: "Wisconsin Property Tax Relief (Circuit Breaker Credit)",
    shortName: "Property Tax Relief",
    tagline: "Provides property tax relief and rent certificates to low-income elderly homeowners and renters.",
    savingsRange: "$500 – $2,500/year",
    description: "Provides property tax relief and rent certificates to low-income elderly homeowners and renters.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $25000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-property-tax-application", name: "Wisconsin Senior Property Tax Relief Application", description: "Apply for property tax exemptions, deferrals, or credits available to qualifying seniors.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "wisconsin-long-term-care-ombudsman-program",
    name: "Wisconsin Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of nursing homes, assisted living, and other long-term care facilities.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of nursing homes, assisted living, and other long-term care facilities.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "wisconsin-home-delivered-meals",
    name: "Wisconsin Home Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors 60+ through county Aging units.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors 60+ through county Aging units.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "wisconsin-state-ssi-supplement",
    name: "Wisconsin State SSI Supplement",
    shortName: "SSI Supplement",
    tagline: "State supplement to federal SSI payments for eligible aged, blind, or disabled individuals.",
    savingsRange: "$3,000 – $10,000/year",
    description: "State supplement to federal SSI payments for eligible aged, blind, or disabled individuals.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $1050/month",
      "Must meet disability requirements",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "federal-ssi-application", name: "SSI Application (Federal)", description: "Apply for Supplemental Security Income through the Social Security Administration.", url: "https://www.ssa.gov/benefits/ssi/" },
      { id: "wisconsin-ssi-supplement", name: "Wisconsin SSI State Supplement", description: "State supplement is typically automatic once SSI is approved. Contact your local office to confirm.", url: "https://access.wisconsin.gov" },
    ],
  },
  {
    id: "wisconsin-judicare-legal-services-for-seniors",
    name: "Wisconsin Judicare Legal Services for Seniors",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors 60+ on benefits, housing, and consumer issues.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors 60+ on benefits, housing, and consumer issues.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2000/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "wisconsin-family-caregiver-support-program",
    name: "Wisconsin Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services including respite care, counseling, training, and supplies for family caregivers.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services including respite care, counseling, training, and supplies for family caregivers.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $3500/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wisconsin-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── Wyoming ─────────────────────────────────────────────────────────────────────

const wyomingPrograms: WaiverProgram[] = [
  {
    id: "aged-blind-and-disabled-medicaid",
    name: "Aged, Blind, and Disabled Medicaid",
    shortName: "ABD Medicaid",
    tagline: "Wyoming's Medicaid program for seniors aged 65+, blind, or disabled with limited income.",
    savingsRange: "$5,000 – $20,000/year",
    description: "Wyoming's Medicaid program for seniors aged 65+, blind, or disabled with limited income.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-medicaid-application", name: "Wyoming Medicaid Application", description: "Official Wyoming Medicaid application. Apply online or download a printable form.", url: "https://dfs.wyo.gov/assistance-programs/medicaid/" },
    ],
  },
  {
    id: "community-choice-waiver-ccw",
    name: "Community Choice Waiver (CCW)",
    shortName: "CCW",
    tagline: "Home and community-based services Medicaid waiver for Wyoming adults aged 65+ who need nursing home level of care.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Home and community-based services Medicaid waiver for Wyoming adults aged 65+ who need nursing home level of care.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $2901/month",
      "Must be enrolled in Medicaid",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-medicaid-application", name: "Wyoming Medicaid Application", description: "Official Wyoming Medicaid application, required for waiver enrollment.", url: "https://dfs.wyo.gov/assistance-programs/medicaid/" },
      { id: "wyoming-hcbs-referral", name: "HCBS Waiver Referral/Enrollment Form", description: "Request a functional assessment and referral to home and community-based waiver services.", url: "https://dfs.wyo.gov/assistance-programs/medicaid/" },
    ],
  },
  {
    id: "medicare-savings-programs",
    name: "Medicare Savings Programs",
    shortName: "Medicare Savings",
    tagline: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    savingsRange: "$2,000 – $8,000/year",
    description: "State-administered programs including QMB, SLMB, and QI for low-income Medicare beneficiaries.",
    eligibilityHighlights: [
      "Age 65 or older",
      "Income below $967/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-msp-application", name: "Medicare Savings Program Application", description: "Apply for QMB, SLMB, or QI coverage to help pay Medicare premiums, deductibles, and copays.", url: "https://dfs.wyo.gov/assistance-programs/medicaid/" },
    ],
  },
  {
    id: "supplemental-nutrition-assistance-program-snap",
    name: "Supplemental Nutrition Assistance Program (SNAP)",
    shortName: "SNAP",
    tagline: "Wyoming's food assistance program providing monthly benefits via EBT card to low-income households.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Wyoming's food assistance program providing monthly benefits via EBT card to low-income households.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $1984/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-snap-application", name: "Wyoming SNAP Application", description: "Apply for Supplemental Nutrition Assistance Program (food assistance) benefits.", url: "https://dfs.wyo.gov/assistance-programs/snap/" },
    ],
  },
  {
    id: "low-income-energy-assistance-program-liheap",
    name: "Low-Income Energy Assistance Program (LIHEAP)",
    shortName: "LIHEAP",
    tagline: "Helps low-income Wyoming households, including seniors, pay heating and energy costs.",
    savingsRange: "$500 – $2,000/year",
    description: "Helps low-income Wyoming households, including seniors, pay heating and energy costs.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $3092/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-energy-application", name: "Wyoming Energy Assistance Application", description: "Apply for help paying home heating and cooling bills through LIHEAP.", url: "https://dfs.wyo.gov/assistance-programs/liheap/" },
    ],
  },
  {
    id: "senior-health-insurance-information-program-shiip",
    name: "Senior Health Insurance Information Program (SHIIP)",
    shortName: "SHIIP",
    tagline: "Free counseling and assistance for Wyoming Medicare beneficiaries on Medicare options and enrollment.",
    savingsRange: "$1,000 – $5,000/year",
    description: "Free counseling and assistance for Wyoming Medicare beneficiaries on Medicare options and enrollment.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-ship-counseling", name: "SHIP Medicare Counseling Request", description: "Request free, unbiased Medicare counseling to compare plans and understand your benefits.", url: "https://www.shiphelp.org" },
    ],
  },
  {
    id: "long-term-care-ombudsman-program",
    name: "Long-Term Care Ombudsman Program",
    shortName: "LTC Ombudsman",
    tagline: "Advocates for residents of long-term care facilities in Wyoming, investigating complaints.",
    savingsRange: "$10,000 – $30,000/year",
    description: "Advocates for residents of long-term care facilities in Wyoming, investigating complaints.",
    eligibilityHighlights: [
      "Age 65 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-ombudsman-complaint", name: "Long-Term Care Ombudsman Complaint Form", description: "File a complaint or request advocacy assistance for nursing home or assisted living concerns.", url: "https://acl.gov/programs/protecting-rights-and-preventing-abuse/long-term-care-ombudsman-program" },
    ],
  },
  {
    id: "wyoming-legal-services-for-the-elderly",
    name: "Wyoming Legal Services for the Elderly",
    shortName: "Senior Legal Aid",
    tagline: "Provides free legal assistance to low-income seniors aged 60+ on benefits and housing issues.",
    savingsRange: "$500 – $3,000/year",
    description: "Provides free legal assistance to low-income seniors aged 60+ on benefits and housing issues.",
    eligibilityHighlights: [
      "Age 60 or older",
      "Income below $2350/month",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-legal-intake", name: "Senior Legal Services Intake Form", description: "Request free legal assistance for issues like benefits denials, housing, and consumer protection.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "home-delivered-meals",
    name: "Home-Delivered Meals",
    shortName: "Home Meals",
    tagline: "Provides nutritious meals delivered to homebound seniors aged 60+ through Wyoming aging services.",
    savingsRange: "$1,500 – $3,600/year",
    description: "Provides nutritious meals delivered to homebound seniors aged 60+ through Wyoming aging services.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-meals-referral", name: "Senior Meals Program Referral", description: "Request home-delivered or congregate meals through your local Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
  {
    id: "national-family-caregiver-support-program",
    name: "National Family Caregiver Support Program",
    shortName: "Caregiver Support",
    tagline: "Offers support services for family caregivers of seniors aged 60+ including respite and training.",
    savingsRange: "$2,000 – $8,000/year",
    description: "Offers support services for family caregivers of seniors aged 60+ including respite and training.",
    eligibilityHighlights: [
      "Age 60 or older",
    ],
    applicationSteps: [
      { step: 1, title: "Check your eligibility", description: "Use our benefits finder to see if you qualify, or review the eligibility highlights above." },
      { step: 2, title: "Gather required documents", description: "Prepare proof of age, income, residency, and any disability documentation that may be required." },
      { step: 3, title: "Submit your application", description: "Complete and submit the application form. A caseworker will review your information and determine eligibility." },
    ],
    forms: [
      { id: "wyoming-caregiver-application", name: "Family Caregiver Support Application", description: "Apply for respite care, caregiver training, and support services through your Area Agency on Aging.", url: "https://eldercare.acl.gov" },
    ],
  },
];

// ─── All 50 States ──────────────────────────────────────────────────────────

export const allStates: StateData[] = [
  {
    id: "alabama",
    name: "Alabama",
    abbreviation: "AL",
    description: "Alabama's Medicaid programs provide home and community-based services to help seniors and adults with disabilities remain at home rather than entering a nursing facility.",
    programs: alabamaPrograms,
  },
  {
    id: "alaska",
    name: "Alaska",
    abbreviation: "AK",
    description: "Alaska offers Medicaid waiver programs through the Division of Senior and Disabilities Services to help residents remain at home with the supports they need.",
    programs: alaskaPrograms,
  },
  {
    id: "arizona",
    name: "Arizona",
    abbreviation: "AZ",
    description: "Arizona's Long-Term Care System (ALTCS) provides comprehensive Medicaid managed care for seniors and adults with disabilities who need nursing facility level of care.",
    programs: arizonaPrograms,
  },
  {
    id: "arkansas",
    name: "Arkansas",
    abbreviation: "AR",
    description: "Arkansas offers Medicaid waiver programs through DHS to help elderly and disabled residents access home and community-based services as an alternative to nursing home care.",
    programs: arkansasPrograms,
  },
  {
    id: "california",
    name: "California",
    abbreviation: "CA",
    description: "California offers several Medi-Cal waiver programs to help seniors and people with disabilities receive care at home and in the community. These programs provide an alternative to nursing home placement and support independent living.",
    programs: californiaPrograms,
  },
  {
    id: "colorado",
    name: "Colorado",
    abbreviation: "CO",
    description: "Colorado's Medicaid HCBS waivers help seniors and adults with disabilities access home and community-based care, coordinated through local Single Entry Point agencies.",
    programs: coloradoPrograms,
  },
  {
    id: "connecticut",
    name: "Connecticut",
    abbreviation: "CT",
    description: "Connecticut's home care programs, including the Home Care Program for Elders, help older adults remain safely in their homes with Medicaid or state-funded support.",
    programs: connecticutPrograms,
  },
  {
    id: "delaware",
    name: "Delaware",
    abbreviation: "DE",
    description: "Delaware offers integrated Medicaid managed care through Diamond State Health Plan Plus, providing long-term services and supports for seniors and adults with disabilities.",
    programs: delawarePrograms,
  },
  {
    id: "florida",
    name: "Florida",
    abbreviation: "FL",
    description: "Florida's Medicaid waiver programs help seniors and adults with disabilities live in the community by providing home and community-based services as an alternative to nursing home placement.",
    programs: floridaPrograms,
  },
  {
    id: "georgia",
    name: "Georgia",
    abbreviation: "GA",
    description: "Georgia's Medicaid waiver programs, including CCSP and SOURCE, help elderly and disabled residents receive home and community-based care rather than nursing home placement.",
    programs: georgiaPrograms,
  },
  {
    id: "hawaii",
    name: "Hawaii",
    abbreviation: "HI",
    description: "Hawaii offers Medicaid home and community-based services through the QUEST Expanded program and state-funded Kupuna Care for seniors needing daily assistance.",
    programs: hawaiiPrograms,
  },
  {
    id: "idaho",
    name: "Idaho",
    abbreviation: "ID",
    description: "Idaho's Medicaid HCBS waivers provide home and community-based services to elderly and disabled residents through the Department of Health and Welfare.",
    programs: idahoPrograms,
  },
  {
    id: "illinois",
    name: "Illinois",
    abbreviation: "IL",
    description: "Illinois offers home and community-based services for seniors through the Community Care Program and Medicaid HCBS waivers, administered by the Department on Aging.",
    programs: illinoisPrograms,
  },
  {
    id: "indiana",
    name: "Indiana",
    abbreviation: "IN",
    description: "Indiana's Pathways for Aging and HCBS waivers provide home and community-based care for seniors and adults with disabilities as alternatives to nursing home placement.",
    programs: indianaPrograms,
  },
  {
    id: "iowa",
    name: "Iowa",
    abbreviation: "IA",
    description: "Iowa offers Medicaid HCBS waivers for elderly adults and individuals with brain injuries, coordinated through Iowa Medicaid managed care organizations.",
    programs: iowaPrograms,
  },
  {
    id: "kansas",
    name: "Kansas",
    abbreviation: "KS",
    description: "Kansas's KanCare Medicaid program includes HCBS waivers for frail elderly individuals and adults with physical disabilities to receive home and community-based care.",
    programs: kansasPrograms,
  },
  {
    id: "kentucky",
    name: "Kentucky",
    abbreviation: "KY",
    description: "Kentucky offers HCBS waivers and supports for community living to help seniors and adults with disabilities remain in their homes rather than nursing facilities.",
    programs: kentuckyPrograms,
  },
  {
    id: "louisiana",
    name: "Louisiana",
    abbreviation: "LA",
    description: "Louisiana's Medicaid waiver programs through the Office of Aging and Adult Services and OCDD provide home and community-based supports for elderly and disabled residents.",
    programs: louisianaPrograms,
  },
  {
    id: "maine",
    name: "Maine",
    abbreviation: "ME",
    description: "Maine offers MaineCare HCBS waivers and PACE to help seniors and adults with disabilities access home and community-based services as an alternative to nursing care.",
    programs: mainePrograms,
  },
  {
    id: "maryland",
    name: "Maryland",
    abbreviation: "MD",
    description: "Maryland's Medicaid waiver programs provide home and community-based services for adults with physical disabilities and seniors, coordinated through the Department of Health.",
    programs: marylandPrograms,
  },
  {
    id: "massachusetts",
    name: "Massachusetts",
    abbreviation: "MA",
    description: "Massachusetts offers a range of Medicaid HCBS programs including Adult Foster Care, Group Adult Foster Care, and PACE for seniors and adults with disabilities.",
    programs: massachusettsPrograms,
  },
  {
    id: "michigan",
    name: "Michigan",
    abbreviation: "MI",
    description: "Michigan's MI Choice Waiver and PACE program help seniors and adults with disabilities receive home and community-based services coordinated through waiver agents.",
    programs: michiganPrograms,
  },
  {
    id: "minnesota",
    name: "Minnesota",
    abbreviation: "MN",
    description: "Minnesota's Elderly Waiver and Brain Injury Waiver provide home and community-based services for seniors and adults with disabilities through county-coordinated care.",
    programs: minnesotaPrograms,
  },
  {
    id: "mississippi",
    name: "Mississippi",
    abbreviation: "MS",
    description: "Mississippi offers Medicaid HCBS waiver programs for adults with physical disabilities and PACE for seniors who need nursing home level of care in the community.",
    programs: mississippiPrograms,
  },
  {
    id: "missouri",
    name: "Missouri",
    abbreviation: "MO",
    description: "Missouri's MO HealthNet HCBS waiver programs provide home and community-based services for aged and disabled residents, including self-directed care options.",
    programs: missouriPrograms,
  },
  {
    id: "montana",
    name: "Montana",
    abbreviation: "MT",
    description: "Montana's HCBS waivers through DPHHS provide home and community-based services for elderly individuals, people with physical disabilities, and those with developmental disabilities.",
    programs: montanaPrograms,
  },
  {
    id: "nebraska",
    name: "Nebraska",
    abbreviation: "NE",
    description: "Nebraska offers HCBS Medicaid waivers and PACE to help seniors and adults with disabilities access home and community-based care as alternatives to nursing home placement.",
    programs: nebraskaPrograms,
  },
  {
    id: "nevada",
    name: "Nevada",
    abbreviation: "NV",
    description: "Nevada's Medicaid HCBS waivers for frail elderly individuals and adults with physical disabilities help residents remain at home with community-based supports.",
    programs: nevadaPrograms,
  },
  {
    id: "new-hampshire",
    name: "New Hampshire",
    abbreviation: "NH",
    description: "New Hampshire's Choices for Independence Waiver and In-Home Support Waiver provide Medicaid home and community-based services for seniors and adults with disabilities.",
    programs: newHampshirePrograms,
  },
  {
    id: "new-jersey",
    name: "New Jersey",
    abbreviation: "NJ",
    description: "New Jersey's MLTSS and Global Options programs integrate long-term services and supports into Medicaid managed care for residents who need nursing facility level of care.",
    programs: newJerseyPrograms,
  },
  {
    id: "new-mexico",
    name: "New Mexico",
    abbreviation: "NM",
    description: "New Mexico's Mi Via self-directed waiver and Medically Fragile Waiver provide Medicaid home and community-based services for individuals with disabilities.",
    programs: newMexicoPrograms,
  },
  {
    id: "new-york",
    name: "New York",
    abbreviation: "NY",
    description: "New York's Managed Long-Term Care and CDPAP programs provide comprehensive home and community-based services and self-directed personal care for Medicaid-eligible residents.",
    programs: newYorkPrograms,
  },
  {
    id: "north-carolina",
    name: "North Carolina",
    abbreviation: "NC",
    description: "North Carolina's CAP/DA and Innovations waivers provide Medicaid home and community-based services for adults with physical disabilities and intellectual disabilities.",
    programs: northCarolinaPrograms,
  },
  {
    id: "north-dakota",
    name: "North Dakota",
    abbreviation: "ND",
    description: "North Dakota's Medicaid HCBS waivers provide home-based care for elderly and disabled residents and specialized supports for individuals with traumatic brain injuries.",
    programs: northDakotaPrograms,
  },
  {
    id: "ohio",
    name: "Ohio",
    abbreviation: "OH",
    description: "Ohio's PASSPORT Program and Assisted Living Waiver help seniors and adults with disabilities access Medicaid-funded community-based care as alternatives to nursing home placement.",
    programs: ohioPrograms,
  },
  {
    id: "oklahoma",
    name: "Oklahoma",
    abbreviation: "OK",
    description: "Oklahoma's ADvantage Waiver and Community Waiver provide home and community-based Medicaid services for elderly residents and adults with intellectual disabilities.",
    programs: oklahomaPrograms,
  },
  {
    id: "oregon",
    name: "Oregon",
    abbreviation: "OR",
    description: "Oregon's K Plan and APD program provide comprehensive home and community-based long-term care services through coordinated care organizations and DSHS offices.",
    programs: oregonPrograms,
  },
  {
    id: "pennsylvania",
    name: "Pennsylvania",
    abbreviation: "PA",
    description: "Pennsylvania's LIFE (PACE) program and Aging Waiver help seniors access comprehensive Medicaid long-term care services while remaining in their communities.",
    programs: pennsylvaniaPrograms,
  },
  {
    id: "rhode-island",
    name: "Rhode Island",
    abbreviation: "RI",
    description: "Rhode Island's Global Consumer Choice Compact Waiver and Personal Choice Program provide integrated Medicaid home care and self-directed personal care services.",
    programs: rhodeIslandPrograms,
  },
  {
    id: "south-carolina",
    name: "South Carolina",
    abbreviation: "SC",
    description: "South Carolina's Community Long-Term Care and Community Choices programs provide Medicaid home and community-based services for seniors and adults with disabilities.",
    programs: southCarolinaPrograms,
  },
  {
    id: "south-dakota",
    name: "South Dakota",
    abbreviation: "SD",
    description: "South Dakota offers Medicaid HCBS waivers for elderly and disabled residents and developmental disability services through the Department of Social Services.",
    programs: southDakotaPrograms,
  },
  {
    id: "tennessee",
    name: "Tennessee",
    abbreviation: "TN",
    description: "Tennessee's TennCare CHOICES and ECF CHOICES programs provide Medicaid managed long-term care for seniors, adults with physical disabilities, and those with developmental disabilities.",
    programs: tennesseePrograms,
  },
  {
    id: "texas",
    name: "Texas",
    abbreviation: "TX",
    description: "Texas offers Medicaid waiver programs through the Health and Human Services Commission (HHSC) to help seniors and adults with disabilities receive long-term care services at home or in the community.",
    programs: texasPrograms,
  },
  {
    id: "utah",
    name: "Utah",
    abbreviation: "UT",
    description: "Utah's New Choices Waiver and Physical Disability HCBS waiver help seniors and adults with disabilities remain in the community with Medicaid-funded supports.",
    programs: utahPrograms,
  },
  {
    id: "vermont",
    name: "Vermont",
    abbreviation: "VT",
    description: "Vermont's Choices for Care Waiver and Enhanced Residential Care program provide Medicaid home and community-based services coordinated through DAIL.",
    programs: vermontPrograms,
  },
  {
    id: "virginia",
    name: "Virginia",
    abbreviation: "VA",
    description: "Virginia's CCC+ and EDCD Waiver programs provide integrated Medicaid managed care and self-directed personal care services for seniors and adults with disabilities.",
    programs: virginiaPrograms,
  },
  {
    id: "washington",
    name: "Washington",
    abbreviation: "WA",
    description: "Washington's COPES and Community First Choice programs provide comprehensive home and community-based Medicaid services for seniors and adults with disabilities.",
    programs: washingtonPrograms,
  },
  {
    id: "west-virginia",
    name: "West Virginia",
    abbreviation: "WV",
    description: "West Virginia's Aged and Disabled Waiver and IIMM Waiver provide Medicaid home and community-based services for elderly residents and individuals with intellectual disabilities.",
    programs: westVirginiaPrograms,
  },
  {
    id: "wisconsin",
    name: "Wisconsin",
    abbreviation: "WI",
    description: "Wisconsin's Family Care program and PACE provide comprehensive Medicaid managed long-term care for frail elderly adults and adults with physical and intellectual disabilities.",
    programs: wisconsinPrograms,
  },
  {
    id: "wyoming",
    name: "Wyoming",
    abbreviation: "WY",
    description: "Wyoming offers Medicaid HCBS waivers for elderly and disabled residents and intellectual disability services through the Department of Health.",
    programs: wyomingPrograms,
  },
];

export function getStateById(id: string): StateData | undefined {
  return allStates.find((s) => s.id === id);
}

export function getProgramById(stateId: string, programId: string): WaiverProgram | undefined {
  const state = getStateById(stateId);
  return state?.programs.find((p) => p.id === programId);
}

export const activeStateIds = allStates.map((s) => s.id);
