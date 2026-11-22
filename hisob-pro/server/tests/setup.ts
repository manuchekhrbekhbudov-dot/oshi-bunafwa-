import 'dotenv/config';

process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) {
  // Тестҳо ҳеҷ гоҳ ба базаи асосӣ даст намерасонанд
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
