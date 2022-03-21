export class DateUtils {
  static getTimestamp(date: Date): number {
    return new Date(date).getTime() / 1000;
  }

  static getCurrentTimestampPlusDays(days: number): number {
    let today = new Date();
    today.setDate(today.getDate() + days);
    return new Date(today.toUTCString()).getTime() / 1000;
  }

  static getCurrentTimestampPlus(hours: number): number {
    let today = new Date();
    today.setHours(today.getHours() + hours);
    return new Date(today.toUTCString()).getTime() / 1000;
  }

  static getCurrentTimestampPlusMinute(minutes: number): number {
    let today = new Date();
    today.setMinutes(today.getMinutes() + minutes);
    return new Date(today.toUTCString()).getTime() / 1000;
  }

  static getCurrentTimestamp(): number {
    return new Date(new Date().toUTCString()).getTime() / 1000;
  }

  static getDateFromTimestampWithoutTime(timestamp: number) {
    return new Date(timestamp * 1000).toJSON().slice(0, 10);
  }
}
