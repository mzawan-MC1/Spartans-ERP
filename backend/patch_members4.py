import re

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "r", encoding="utf-8") as f:
    content = f.read()

mappings = {
    "def get_members": "receptionist.view_members",
    "def get_member(": "receptionist.view_members",
    "def update_member": "receptionist.edit_members_basic",
    "def upload_member_image": "receptionist.edit_members_basic",
    "def deactivate_member": "manager.manage_members",
    "def get_available_programs": "receptionist.view_programs",
    "def create_membership": "receptionist.create_memberships",
    "def update_membership": "manager.manage_memberships",
    "def get_member_memberships": "receptionist.view_memberships",
    "def get_all_memberships": "receptionist.view_memberships",
    "def update_membership_details": "manager.manage_memberships",
    "def freeze_membership": "manager.freeze_memberships",
    "def unfreeze_membership": "manager.freeze_memberships",
    "def get_agreements": "receptionist.view_agreements",
    "def create_agreement": "manager.manage_agreements",
    "def update_agreement": "manager.manage_agreements",
    "def sign_agreement": "receptionist.view_agreements",
    "def get_member_agreements": "receptionist.view_agreements",
    "def delete_agreement": "manager.manage_agreements",
    "def get_pricing_plans": "receptionist.view_memberships",
    "def create_pricing_plan": "manager.manage_memberships",
    "def update_pricing_plan": "manager.manage_memberships",
    "def delete_pricing_plan": "manager.manage_memberships",
    "def get_payments": "receptionist.view_payments",
    "def get_member_payments": "receptionist.view_payments",
    "def record_cash_payment": "receptionist.record_cash_payments",
    "def update_payment_status": "manager.manage_payments",
    "def get_document_types": "receptionist.view_members",
    "def create_document_type": "manager.manage_documents",
    "def update_document_type": "manager.manage_documents",
    "def upload_member_document": "manager.manage_documents",
    "def get_member_documents": "receptionist.view_members",
    "def import_members": "manager.manage_members",
    "def get_member_history": "receptionist.view_members",
    "def get_communications": "receptionist.view_members"
}

# Split by "def " and process each function
parts = content.split("\n@")
new_parts = []

for part in parts:
    func_part = part
    if not part.startswith("@") and len(new_parts) > 0:
        func_part = "@" + part
        
    # find which mapping applies
    for func_sig, perm in mappings.items():
        if func_sig in func_part:
            func_part = re.sub(r'user = await require_member_access\(request(?:,\s*"[^"]+")?\)', f'user = await require_member_access(request, "{perm}")', func_part, count=1)
            break
            
    new_parts.append(func_part)

content = "\n@".join(new_parts)
# Clean up first split if it added @
if content.startswith("\n@@"):
    content = content[2:]
elif content.startswith("\n@"):
    content = content[1:]

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "w", encoding="utf-8") as f:
    f.write(content)
