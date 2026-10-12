from datetime import timedelta

import dapr.ext.workflow as wf

from runtime import wfr
from activities import check_credit_activity, notify_applicant_activity
from models import LoanApplication, LoanDecision

UNDERWRITER_DECISION_EVENT = "underwriter-decision"


@wfr.workflow(name="loan_application_workflow")
def loan_application_workflow(ctx: wf.DaprWorkflowContext, application: LoanApplication):
    credit = yield ctx.call_activity(check_credit_activity, input=application)

    if credit.score >= 750 and application.amount <= 10_000:
        status = "approved"
    else:
        try:
            decision = yield ctx.wait_for_external_event(
                UNDERWRITER_DECISION_EVENT,
                timeout=timedelta(days=5),
            )
            status = "approved" if decision.get("approved") else "declined"
        except TimeoutError:
            status = "expired"

    result = LoanDecision(application_id=application.id, status=status)
    yield ctx.call_activity(notify_applicant_activity, input=result)
    return result
