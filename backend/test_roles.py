import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('.env')

async def run():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    roles = await db.users.distinct('role')
    print("Distinct roles in DB:", roles)
    client.close()

if __name__ == '__main__':
    asyncio.run(run())
