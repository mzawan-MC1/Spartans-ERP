import re

replacements = {
    "get_members": "receptionist.view_members",
    "get_member": "receptionist.view_members",
    "update_member": "receptionist.edit_members_basic",
    "upload_member_image": "receptionist.edit_members_basic",
    "deactivate_member": "manager.manage_members",
    "get_available_programs": "receptionist.view_programs",
    "create_membership": "receptionist.create_memberships",
    "update_membership": "manager.manage_memberships",
    "get_member_memberships": "receptionist.view_memberships",
    "get_all_memberships": "receptionist.view_memberships",
    "update_membership_details": "manager.manage_memberships",
    "freeze_membership": "manager.freeze_memberships",
    "unfreeze_membership": "manager.freeze_memberships",
    "get_agreements": "receptionist.view_agreements",
    "create_agreement": "manager.manage_agreements",
    "update_agreement": "manager.manage_agreements",
    "sign_agreement": "receptionist.view_agreements", 
    "get_member_agreements": "receptionist.view_agreements",
    "delete_agreement": "manager.manage_agreements",
    "get_pricing_plans": "receptionist.view_memberships",
    "create_pricing_plan": "manager.manage_memberships",
    "update_pricing_plan": "manager.manage_memberships",
    "delete_pricing_plan": "manager.manage_memberships",
    "get_payments": "receptionist.view_payments",
    "get_member_payments": "receptionist.view_payments",
    "record_cash_payment": "receptionist.record_cash_payments",
    "initiate_payment": None,
    "update_payment_status": "manager.manage_payments",
    "get_document_types": "receptionist.view_members",
    "create_document_type": "manager.manage_documents",
    "update_document_type": "manager.manage_documents",
    "upload_member_document": "manager.manage_documents",
    "get_member_documents": "receptionist.view_members",
    "import_members": "manager.manage_members",
    "get_member_history": "receptionist.view_members",
    "get_communications": "receptionist.view_members",
}

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "r", encoding="utf-8") as f:
    content = f.read()

# First, revert any previous replacements
content = re.sub(r'user = await require_member_access\(request,\s*"[^"]+"\)', 'user = await require_member_access(request)', content)

# Then apply the correct ones
for func_name, perm in replacements.items():
    if perm:
        pattern = rf'(def {func_name}\(.*?:.*?)(user = await require_member_access\(request\))'
        content = re.sub(pattern, rf'\1user = await require_member_access(request, "{perm}")', content, flags=re.DOTALL)

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "w", encoding="utf-8") as f:
    f.write(content)
