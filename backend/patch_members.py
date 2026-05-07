import re

replacements = {
    r"def get_members\(": "receptionist.view_members",
    r"def get_member\(": "receptionist.view_members",
    r"def update_member\(": "receptionist.edit_members_basic",
    r"def upload_member_image\(": "receptionist.edit_members_basic",
    r"def deactivate_member\(": "manager.manage_members",
    r"def get_available_programs\(": "receptionist.view_programs",
    r"def create_membership\(": "receptionist.create_memberships",
    r"def update_membership\(": "manager.manage_memberships",
    r"def get_member_memberships\(": "receptionist.view_memberships",
    r"def get_all_memberships\(": "receptionist.view_memberships",
    r"def update_membership_details\(": "manager.manage_memberships",
    r"def freeze_membership\(": "manager.freeze_memberships",
    r"def unfreeze_membership\(": "manager.freeze_memberships",
    r"def get_agreements\(": "receptionist.view_agreements",
    r"def create_agreement\(": "manager.manage_agreements",
    r"def update_agreement\(": "manager.manage_agreements",
    r"def sign_agreement\(": "receptionist.view_agreements", # Receptionist should be able to sign agreements during onboarding
    r"def get_member_agreements\(": "receptionist.view_agreements",
    r"def delete_agreement\(": "manager.manage_agreements",
    r"def get_pricing_plans\(": "receptionist.view_memberships",
    r"def create_pricing_plan\(": "manager.manage_memberships",
    r"def update_pricing_plan\(": "manager.manage_memberships",
    r"def delete_pricing_plan\(": "manager.manage_memberships",
    r"def get_payments\(": "receptionist.view_payments",
    r"def get_member_payments\(": "receptionist.view_payments",
    r"def record_cash_payment\(": "receptionist.record_cash_payments",
    r"def update_payment_status\(": "manager.manage_payments",
    r"def get_document_types\(": "receptionist.view_members",
    r"def create_document_type\(": "manager.manage_documents",
    r"def update_document_type\(": "manager.manage_documents",
    r"def upload_member_document\(": "manager.manage_documents",
    r"def get_member_documents\(": "receptionist.view_members",
    r"def import_members\(": "manager.manage_members",
    r"def get_member_history\(": "receptionist.view_members",
    r"def get_communications\(": "receptionist.view_members",
}

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "user = await require_member_access(request)" in line:
        # Find which function we are in by looking upwards
        for j in range(i, -1, -1):
            func_match = None
            for func_pattern, perm in replacements.items():
                if re.search(func_pattern, lines[j]):
                    func_match = perm
                    break
            if func_match:
                lines[i] = line.replace("user = await require_member_access(request)", f'user = await require_member_access(request, "{func_match}")')
                break

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "w", encoding="utf-8") as f:
    f.writelines(lines)
