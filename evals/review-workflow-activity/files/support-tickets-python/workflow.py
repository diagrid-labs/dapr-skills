import dapr.ext.workflow as wf

from runtime import wfr
from activities import (
    assign_agent_activity,
    create_crm_ticket_activity,
    send_acknowledgement_activity,
    suggest_articles_activity,
)
from models import AckEmail, ArticleQuery, AssignmentRequest, CrmTicketRequest, TicketInput, TicketOutput


@wfr.workflow(name="support_ticket_workflow")
def support_ticket_workflow(ctx: wf.DaprWorkflowContext, ticket: TicketInput):
    case = yield ctx.call_activity(
        create_crm_ticket_activity,
        input=CrmTicketRequest(ticket_id=ticket.id, customer_email=ticket.customer_email, subject=ticket.subject),
    )
    yield ctx.call_activity(
        suggest_articles_activity,
        input=ArticleQuery(ticket_id=ticket.id, subject=ticket.subject),
    )
    assignment = yield ctx.call_activity(
        assign_agent_activity,
        input=AssignmentRequest(ticket_id=ticket.id, subject=ticket.subject),
    )
    yield ctx.call_activity(
        send_acknowledgement_activity,
        input=AckEmail(ticket_id=ticket.id, customer_email=ticket.customer_email, crm_case_id=case.crm_case_id),
    )
    return TicketOutput(ticket_id=ticket.id, assigned_to=assignment.agent_id)
