"""
Test Supabase connection
"""
from supabase_client import get_supabase_client

def test_connection():
    """Test Supabase connection"""
    try:
        supabase = get_supabase_client()
        
        # Try to fetch doctors table (should be empty or have your doctor)
        response = supabase.table('doctors').select('*').execute()
        
        print("✅ Supabase connection successful!")
        print(f"📊 Doctors table exists and has {len(response.data)} records")
        
        # Test other tables
        tables = ['patients', 'conversations', 'soap_notes', 'prescriptions', 'medications']
        for table in tables:
            try:
                response = supabase.table(table).select('count').execute()
                print(f"✅ {table} table exists")
            except Exception as e:
                print(f"❌ {table} table error: {str(e)}")
        
        print("\n🎉 All tables are set up correctly!")
        return True
        
    except Exception as e:
        print(f"❌ Error connecting to Supabase: {str(e)}")
        print("\nPlease check:")
        print("1. Your .env file has correct SUPABASE_URL and SUPABASE_SERVICE_KEY")
        print("2. You've run the SQL schema in Supabase SQL Editor")
        print("3. Your Supabase project is not paused")
        return False

if __name__ == "__main__":
    test_connection()