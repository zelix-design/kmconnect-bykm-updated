"""Pydantic request/response models for the API."""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr


# ---------- Users ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    business_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    business_name: Optional[str] = None
    currency: str = "USD"
    role: str = "user"
    created_at: str


class SettingsUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    currency: Optional[Literal["USD", "INR"]] = None


# ---------- Accounts ----------
class AccountIn(BaseModel):
    name: str
    type: Literal["bank", "cash", "credit_card"]
    opening_balance: float = 0.0
    color: Optional[str] = "#10b981"


# ---------- Clients ----------
ClientType = Literal[
    "sub_agent_associate",
    "associate_consultant",
    "km_blr_office",
    "km_tcr_office",
    "km_kmly_office",
]


class ClientIn(BaseModel):
    name: str
    client_type: Optional[ClientType] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None


# ---------- Categories ----------
class CategoryIn(BaseModel):
    name: str
    type: Literal["income", "expense"]
    color: Optional[str] = "#78716c"
    icon: Optional[str] = "Tag"


# ---------- Transactions ----------
class TransactionIn(BaseModel):
    type: Literal["income", "expense"]
    amount: float
    account_id: str
    category_id: Optional[str] = None
    date: str
    description: Optional[str] = ""
    client_id: Optional[str] = None
    linked_invoice_id: Optional[str] = None


# ---------- Invoices ----------
class InvoiceItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0


class PreviousScPayment(BaseModel):
    has: bool = False
    amount: float = 0.0
    mode: Optional[Literal["cash", "bank_transfer", "upi", "cheque", "card", "other"]] = "bank_transfer"
    date: Optional[str] = None
    account_id: Optional[str] = None


class InvoiceIn(BaseModel):
    client_id: str
    invoice_number: str
    issue_date: str
    due_date: str
    items: List[InvoiceItem]
    tax_rate: float = 0.0
    notes: Optional[str] = ""
    status: Literal["draft", "sent", "paid", "overdue"] = "draft"
    campus_visit_no: Optional[str] = None
    student_name: Optional[str] = None
    course: Optional[str] = None
    visited_colleges: Optional[str] = None
    credit_amount: float = 0.0
    auto_log_expenses: bool = True
    expense_account_id: Optional[str] = None
    invoice_type: Literal["campus_visit", "service_charge"] = "campus_visit"
    college: Optional[str] = None
    academic_year: Optional[str] = None
    # When a service-charge invoice draws credit from a specific campus visit
    linked_visit_invoice_id: Optional[str] = None
    # Service-charge: a prior payment already received towards this SC
    previous_sc_payment: Optional[PreviousScPayment] = None
