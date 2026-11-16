// Catálogo da linha Caverna NFC — preços provisórios (custos estimados, 2026-11).
// Para mudar preço ou incluir produto, edite só esta lista: o painel admin lê daqui.
export const PRODUTOS = [
  { id: 'chaveiro',       nome: 'Chaveiro NFC',             preco: 49.90 },
  { id: 'chaveiro_casal', nome: 'Chaveiro Casal',           preco: 79.90 },
  { id: 'porta_retrato',  nome: 'Porta-retrato NFC 15x20',  preco: 119.90 },
  { id: 'quadro',         nome: 'Quadro / Placa NFC A4',    preco: 149.90 },
  { id: 'caixa_memoria',  nome: 'Caixa Memória',            preco: 249.90 },
  { id: 'outro',          nome: 'Outro / sob encomenda',    preco: null }
]

export const PRODUTO_IDS = PRODUTOS.map(p => p.id)
