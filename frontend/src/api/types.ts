import type { components } from './generated'

export type WorkflowView = components['schemas']['WorkflowView']
export type WorkflowSummary = components['schemas']['WorkflowSummary']
export type WorkflowState = WorkflowSummary['state']
export type WorkflowAction = WorkflowSummary['availableActions'][number]
export type Money = components['schemas']['Money']
export type ShoppingConstraints = components['schemas']['ShoppingConstraints']
export type Alternative = components['schemas']['Alternative']
export type ComparisonResult = components['schemas']['ComparisonResult']
export type CheckoutProposal = components['schemas']['CheckoutProposal']
export type Approval = components['schemas']['Approval']
export type Order = components['schemas']['Order']
export type OrderStatus = Order['status']
export type DomainEvent = components['schemas']['DomainEvent']

export interface DemoScenarios {
  happyPath: string
  clarification: string
  alternative: string
  guardrail: string
  checkoutException: string
}
