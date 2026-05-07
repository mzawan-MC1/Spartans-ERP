import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys

async def main():
    client = AsyncIOMotorClient('mongodb+srv://spartansMongo_2024:SpartansLocal2024@spartans-erp.kidpl8v.mongodb.net/?retryWrites=true&w=majority&appName=Spartans-ERP')
    payment = await client.spartans_gym.payments.find_one({"status": {"$in": ["paid", "pending", "completed"]}})
    if not payment:
        print("No payment found")
        return
    print(f"Payment ID: {payment['payment_id']}")

asyncio.run(main())