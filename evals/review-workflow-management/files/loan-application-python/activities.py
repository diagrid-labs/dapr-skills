import logging

from runtime import wfr
from models import CreditCheck, LoanApplication, LoanDecision

logger = logging.getLogger(__name__)


@wfr.activity(name="check_credit_activity")
def check_credit_activity(ctx, application: LoanApplication) -> CreditCheck:
    # TODO: call the credit bureau
    return CreditCheck(applicant_id=application.applicant_id, score=712)


@wfr.activity(name="notify_applicant_activity")
def notify_applicant_activity(ctx, decision: LoanDecision) -> None:
    logger.info("Application %s finished with status %s", decision.application_id, decision.status)
