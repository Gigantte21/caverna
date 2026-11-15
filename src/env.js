// Carrega variáveis antes de qualquer outro módulo (pool.js lê DATABASE_URL na importação).
// .env.local é escrito pelo `neon init`; .env continua valendo. Em produção (Render),
// as variáveis vêm do painel e estes arquivos não existem.
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'] })
