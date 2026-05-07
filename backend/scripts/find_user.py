import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    load_dotenv(".env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    email = os.environ.get("USER_EMAIL", "test123@gmail.com")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    print("Email:", email)
    print("User:", user)

    client.close()


if __name__ == "__main__":
    asyncio.run(run())

