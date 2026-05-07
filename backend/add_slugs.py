import asyncio
import re
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text

async def main():
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    locations = await db.locations.find({}).to_list(100)
    for loc in locations:
        name = loc.get('public_title') or loc.get('name', '')
        slug = slugify(name)
        if not slug:
            slug = loc['location_id']
        await db.locations.update_one({'_id': loc['_id']}, {'$set': {'slug': slug}})
        print(f"Updated {name} -> {slug}")

if __name__ == '__main__':
    asyncio.run(main())
