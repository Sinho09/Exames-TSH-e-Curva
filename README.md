# Sistema de Controle de Exames - Instituto de Olhos Adi Nascimento

## 📋 Descrição

Sistema web para controle e gerenciamento de exames oftalmológicos, com integração completa ao Firebase Firestore para armazenamento e recuperação de dados.

## ✨ Funcionalidades Implementadas

### 🔥 Integração Firebase
- ✅ Conexão completa com Firestore Database
- ✅ Salvamento automático de exames finalizados
- ✅ Carregamento automático do histórico ao iniciar
- ✅ Sincronização em tempo real
- ✅ Backup seguro na nuvem

### 📊 Gestão de Exames
- ✅ Cadastro de novos pacientes
- ✅ Dois tipos de exame: TSH e Curva Tensional
- ✅ Cronômetros automáticos para medidas
- ✅ Alertas sonoros e visuais
- ✅ Campos para PIO (Pressão Intraocular)
- ✅ Paquimetria editável
- ✅ Observações personalizáveis

### 📈 Histórico e Relatórios
- ✅ **Histórico do Dia**: Exames do dia atual
- ✅ **Histórico Antigo**: Exames de dias anteriores
- ✅ Busca por nome, tipo de exame ou operador
- ✅ Impressão individual de exames (formato A5)
- ✅ Impressão em lote (formato A4)
- ✅ Exportação para CSV
- ✅ Exclusão segura de exames

### 🎨 Interface
- ✅ Design responsivo e profissional
- ✅ Modo escuro/claro
- ✅ Logo personalizado
- ✅ Navegação por abas
- ✅ Feedback visual para usuário

## 🚀 Como Usar

### 1. Novo Exame
1. Preencha os dados do paciente
2. Selecione o tipo de exame
3. Clique em "Adicionar Paciente"
4. Siga as instruções na tela para cada medida
5. Finalize o exame quando concluído

### 2. Histórico do Dia
- Visualize todos os exames finalizados hoje
- Use a busca para encontrar exames específicos
- Clique em ▼ para ver detalhes completos
- Edite observações e paquimetria diretamente

### 3. Histórico Antigo
- Acesse exames de dias anteriores
- Mesmas funcionalidades do histórico do dia
- Dados preservados permanentemente no Firebase

### 4. Funcionalidades Extras
- **🖨️ Imprimir**: Gera relatório profissional
- **📄 CSV**: Exporta dados para planilha
- **🗑️ Limpar**: Remove exames (com confirmação)
- **🌙/☀️**: Alterna entre modo escuro/claro

## 🔧 Configuração Técnica

### Arquivos Principais
- `index.html` - Interface principal
- `script.js` - Lógica e integração Firebase
- `style.css` - Estilos e responsividade
- `firebase-config.js` - Configuração do Firebase
- `Ioan.png` - Logo do instituto

### Firebase Configurado
- **Projeto**: bancodedadosioan
- **Coleção**: exames
- **Autenticação**: Configurada
- **Regras**: Permissões adequadas

## 📱 Compatibilidade

- ✅ Desktop (Chrome, Firefox, Safari, Edge)
- ✅ Tablet (iOS, Android)
- ✅ Mobile (responsivo)
- ✅ Impressão (formatos A4 e A5)

## 🔒 Segurança

- Dados criptografados no Firebase
- Backup automático na nuvem
- Validação de formulários
- Confirmações para ações críticas

## 📞 Suporte

Sistema desenvolvido especificamente para o Instituto de Olhos Adi Nascimento.
Todas as funcionalidades foram testadas e validadas.

---

**Desenvolvido com ❤️ para facilitar o trabalho da equipe médica**

