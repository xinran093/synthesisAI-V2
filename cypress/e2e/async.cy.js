describe('template spec', () => {
  it('passes', () => {
    cy.visit('http://localhost:8080/')
    cy.get('#ai-query-input').type('Hello, AI!')
    cy.get('#ask-ai-btn').click()
    cy.get('#ai-chat-window').should('contain.text', 'AI is thinking...')
    
  })
})