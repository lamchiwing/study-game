# apps/backend/app/entitlements_store.py
ENTITLEMENTS: dict[str, str] = {}  # memory demo; 實務請用 DB

def save_entitlement(user_id: str, plan: str):
    ENTITLEMENTS[user_id] = plan
    print(f"[Entitlement] {user_id} -> {plan}")

def has_access(user_id: str, subject: str, grade: str) -> bool:
    from .entitlements import PLANS
    plan = ENTITLEMENTS.get(user_id, "starter")
    allowed = PLANS[plan]["allowed_grades"]
    return grade in allowed
