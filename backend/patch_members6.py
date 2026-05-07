import re

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "r", encoding="utf-8") as f:
    content = f.read()

# Just strictly add allow_member_self=True to the ones we know members need
# We can do this by finding the function def, and replacing the require_member_access call inside it.
member_funcs = [
    "def get_member(",
    "def update_member(",
    "def upload_member_image(",
    "def get_member_memberships(",
    "def get_member_agreements(",
    "def sign_agreement(",
    "def get_payments(",
    "def get_member_payments(",
    "def initiate_payment(",
    "def get_member_documents(",
    "def get_member_history(",
    "def get_communications("
]

parts = content.split("\n@")
new_parts = []

for part in parts:
    func_part = part
    if not part.startswith("@") and len(new_parts) > 0:
        func_part = "@" + part
        
    for m in member_funcs:
        if m in func_part:
            # If it doesn't already have allow_member_self=True, add it.
            if "allow_member_self=True" not in func_part:
                func_part = re.sub(
                    r'(user = await require_member_access\(request(?:,\s*"[^"]+")?)(\))',
                    r'\1, allow_member_self=True\2',
                    func_part,
                    count=1
                )
            break
            
    new_parts.append(func_part)

content = "\n@".join(new_parts)
if content.startswith("\n@@"):
    content = content[2:]
elif content.startswith("\n@"):
    content = content[1:]

with open(r"d:\Dev Projects\Spartans ERP\backend\members.py", "w", encoding="utf-8") as f:
    f.write(content)
