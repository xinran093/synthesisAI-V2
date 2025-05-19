describe('template spec', () => {
  it('passes', () => {
    cy.visit('http://localhost:8080/')
    cy.get('#collaborative-writing').type('Hello, AI!')
    cy.get('#ask-ai-btn').click()
    cy.get('#ai-response').should('have.text', 'Thinking...')
  })
})