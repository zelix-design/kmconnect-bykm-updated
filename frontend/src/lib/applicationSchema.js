// Shared schema + constants for the public application form.
export const STEPS = [
  { key: "basic_info", label: "Basic Info", icon: "User" },
  { key: "course", label: "Course", icon: "GraduationCap" },
  { key: "communication", label: "Communication", icon: "Phone" },
  { key: "academic", label: "Academic", icon: "Books" },
  { key: "payment", label: "Payment", icon: "Receipt" },
  { key: "reference", label: "Reference", icon: "UserCircle" },
];

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export const PARTNER_COLLEGES = [
  "Any partner college",
  "PSG College of Technology",
  "Kongu Engineering College",
  "Bannari Amman Institute of Technology",
  "KSR College of Engineering",
  "Sona College of Technology",
  "M Kumarasamy College of Engineering",
  "Other",
];

export const ADMISSION_TYPES = [
  { value: "management", label: "Management" },
  { value: "government", label: "Government" },
  { value: "merit", label: "Merit" },
  { value: "lateral_entry", label: "Lateral Entry" },
  { value: "other", label: "Other" },
];

export const BOARDS = ["State Board", "CBSE", "ICSE", "Other"];

export const PAYMENT_MODES = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export const REFERENCE_TYPES = [
  { value: "sub_agent", label: "Sub Agent / Associate" },
  { value: "associate", label: "Associate Consultant" },
  { value: "km", label: "KM Office" },
  { value: "staff", label: "Staff" },
  { value: "self", label: "Self / Walk-in" },
  { value: "other", label: "Other" },
];

export const INDIAN_STATES = [
  "Tamil Nadu", "Kerala", "Karnataka", "Andhra Pradesh", "Telangana",
  "Maharashtra", "Gujarat", "Rajasthan", "Madhya Pradesh", "Uttar Pradesh",
  "Bihar", "West Bengal", "Odisha", "Punjab", "Haryana", "Delhi",
  "Jammu & Kashmir", "Himachal Pradesh", "Uttarakhand", "Chhattisgarh",
  "Jharkhand", "Assam", "Goa", "Tripura", "Meghalaya", "Manipur",
  "Nagaland", "Arunachal Pradesh", "Mizoram", "Sikkim", "Puducherry", "Other",
];

export function emptyApplication() {
  return {
    basic_info: {
      student_full_name: "",
      mobile_number: "",
      email: "",
      date_of_birth: "",
      gender: "male",
      aadhaar_number: "",
      nationality: "Indian",
      religion: "",
      caste: "",
    },
    course: {
      interested_course: "",
      preferred_college: "",
      academic_year: "",
      admission_type: "management",
    },
    communication: {
      father_name: "",
      father_mobile: "",
      mother_name: "",
      mother_mobile: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      state: "Tamil Nadu",
      pincode: "",
    },
    academic: {
      tenth: { register_number: "", school_name: "", school_place: "", board: "State Board", year_of_passing: "", percentage: "" },
      twelfth: { register_number: "", school_name: "", school_place: "", board: "State Board", year_of_passing: "", percentage: "" },
    },
    payment: {
      registration_amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_mode: "upi",
      transaction_id: "",
      screenshot_url: "",
    },
    reference: {
      type: "sub_agent",
      name: "",
      contact_number: "",
      place: "",
      notes: "",
    },
  };
}

// Returns an array of error strings — empty when the step is valid.
export function validateStep(stepKey, app) {
  const errors = [];
  const f = app[stepKey];
  if (stepKey === "basic_info") {
    if (!f.student_full_name.trim()) errors.push("Full name is required");
    if (!/^\d{10}$/.test(f.mobile_number.replace(/\s/g, ""))) errors.push("Mobile must be a 10-digit number");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors.push("A valid email is required");
    if (!f.date_of_birth) errors.push("Date of birth is required");
  }
  if (stepKey === "course") {
    if (!f.interested_course.trim()) errors.push("Pick an interested course");
  }
  if (stepKey === "communication") {
    if (!f.father_name.trim()) errors.push("Father's name is required");
    if (!/^\d{10}$/.test(f.father_mobile.replace(/\s/g, ""))) errors.push("Father's mobile must be a 10-digit number");
    if (!f.address_line_1.trim()) errors.push("Address Line 1 is required");
    if (!f.city.trim()) errors.push("City is required");
    if (!/^\d{6}$/.test(f.pincode)) errors.push("Pincode must be 6 digits");
  }
  return errors;
}
