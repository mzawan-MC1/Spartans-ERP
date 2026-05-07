import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def run():
    load_dotenv(".env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    role_code = os.environ.get("ROLE_CODE", "HS_SPARTANS")
    role = await db.roles.find_one({"code": role_code}, {"_id": 0})
    print("Role code:", role_code)
    print("Role doc:", role)

    client.close()


if __name__ == "__main__":
    asyncio.run(run())

