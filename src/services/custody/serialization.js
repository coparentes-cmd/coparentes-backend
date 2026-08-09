export function serializeCustodySchedule(schedule) {
  const weekA = JSON.parse(schedule.weekAJson);
  const weekB = JSON.parse(schedule.weekBJson);
  const weekInterval =
    Number.isFinite(Number(weekA._weekInterval)) && Number(weekA._weekInterval) > 0
      ? Number(weekA._weekInterval)
      : null;
  const cleanWeekA = { ...weekA };
  delete cleanWeekA._weekInterval;

  return {
    id: schedule.id,
    patternType: schedule.patternType,
    startDate: schedule.startDate.toISOString(),
    endDate: schedule.endDate ? schedule.endDate.toISOString() : null,
    weekA: cleanWeekA,
    weekB,
    weekInterval,
    handoverTime: schedule.handoverTime,
    handoverLocation: schedule.handoverLocation,
    status: schedule.status,
    proposedById: schedule.proposedById,
    approvedById: schedule.approvedById,
    approvedAt: schedule.approvedAt ? schedule.approvedAt.toISOString() : null,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString()
  };
}

export function serializeCustodyException(exception) {
  return {
    id: exception.id,
    fromDate: exception.fromDate.toISOString(),
    toDate: exception.toDate.toISOString(),
    custodian: exception.custodian,
    exceptionType: exception.exceptionType,
    reason: exception.reason,
    status: exception.status,
    requesterId: exception.requesterId,
    responseNote: exception.responseNote,
    createdAt: exception.createdAt.toISOString(),
    updatedAt: exception.updatedAt.toISOString()
  };
}
