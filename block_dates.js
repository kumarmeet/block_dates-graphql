import Model from "../lib/model";
import Moment from "moment";
import { extendMoment } from "moment-range";

const moment = extendMoment(Moment);

export default class extends Model {
  //table name -> blocked_dates
  get table() {
    return "blocked_dates";
  }

  //getDateRange() is a helper function
  getDateRange(startDate, endDate, type) {
    let fromDate = moment(startDate);
    let toDate = moment(endDate);
    let diff = toDate.diff(fromDate, type);
    let dateRange = [];

    for (let i = 0; i <= diff; i++) {
      dateRange.push(moment(startDate).add(i, type).format("YYYY-MM-DD"));
    }

    return dateRange;
  }

  //getTimeRange() helper function for getting time range
  /*Object structure -> this.dateHasFound(startDate)).found[0]
    {
      found: [
        RowDataPacket {
          from_date: '2022-04-18 10:00:00',
          to_date: '2022-04-18 17:00:00',
          date_type: 3
        }
      ],
      dateFound: true
    }
  */
  async getTimeRange(startDate){
    const timeDuration = (await this.dateHasFound(startDate)).found[0];

    if(!timeDuration){
      return [];
    }

    const fTime = timeDuration.from_date.split(" ")[1].split(":");
    const tTime = timeDuration.to_date.split(" ")[1].split(":");

    const start = moment().startOf('day');
    const times = +tTime[0];

    const timeRange = [];

    for (let i = +fTime[0]; i <= times; i++) {
      timeRange.push(moment(start).add(60 * i, 'minutes').format("HH:mm"));
    }

    return timeRange;
  }

  //dateHasFound() is a helper function
  async dateHasFound(startDate){
    const found = await this.db.select("from_date", "to_date", "date_type")
    .table(this.table)
    .whereRaw("DATE (`from_date`) = ?", [startDate]);

    return {found, dateFound: found.length !== 0};
  }

  //insertDateAndType() is a helper function
  async insertDateAndType(startDate, endDate, colName, value){
    await this.db(this.table).insert({"from_date": startDate,"to_date": endDate, [colName]: value});
  }

  async deleteDate(startDate){
    await this.db("blocked_dates").where("from_date", startDate).del(["id"],{ includeTriggerModifications: true });
  }

  async compareAndGetDates(comparisonOperator, id, dateType) {
    return await this.db.select("from_date", "to_date", "id", "date_type")
    .table(this.table)
    .where("date_type", comparisonOperator , 3);
  }

  /**
   * It will take two arrays of date range and compare both of them
   * and on the basis of data it will store and 
   * give date types of array
   */
  async compareAndInsertDate(rangeOne, rangeTwo, colName){
    const lengthOne = rangeOne.length - 1;
    const lengthTwo = rangeTwo.length - 1;

    if(rangeOne.length > 1){
      await this.insertDateAndType(`${rangeOne[0]} 00:00:00`, `${rangeOne[lengthOne]} 00:00:00`, colName, 2)
    }else if(rangeOne.length === 1){
      await this.insertDateAndType(`${rangeOne[0]} 00:00:00`, `${rangeOne[lengthOne]} 00:00:00`, colName, 1)
    }
    
    if(rangeTwo.length > 1){
      await this.insertDateAndType(`${rangeTwo[0]} 00:00:00`, `${rangeTwo[lengthTwo]} 00:00:00`, colName, 2)
    }else if(rangeTwo.length === 1){
      await this.insertDateAndType(`${rangeTwo[0]} 00:00:00`, `${rangeTwo[lengthTwo]} 00:00:00`, colName, 1)
    }
  }

  /**
   * helper function for split the range of dates on the basis of delete date 
   * and store into two sperated array (delDate will pop out)
   */
  splitArrayOfDates(dates, delDate){
    const one = [];
    const two = [];

    let i = 0;

    for(const date of dates){
      if(date === delDate){
        dates.splice(0, i + 1);
        break;
      }
      i++;
      one.push(date);
    }

    two.push(...dates);

    return {one, two};  
  }

  //get data from block_dates (found date b/w date range) and date is in column from_date also check by date type
  async getFoundDateAndTypeFromTable(date) {
    return await this.db.raw("select * from blocked_dates where DATE(`from_date`) = '" + date + "' AND date_type IN (1) OR ('" + date + "' BETWEEN DATE(`from_date`) AND DATE(`to_date`) AND date_type = 2 )");
  }

  // async getFoundDateWithTime(date) {
  //   return await this.db.raw("select * from blocked_dates where DATE(`from_date`) = '" + date + "' AND date_type IN (1) OR ('" + date + "' BETWEEN DATE(`from_date`) AND DATE(`to_date`) AND date_type = 2 )");
  // }

  async deleteDatesAndUpdate(delDate){
    
    const selectDates = await this.getFoundDateAndTypeFromTable(delDate);
    
    let found = selectDates[0];
    found = found[0];

    if(!found){
      console.log("Not Found");
      return [];
    }

    //delete single date and date with time
    if(found.date_type === 1 || found.date_type === 3){
      await this.deleteDate(found.from_date);
      return [];
    }

    //below logic of range of dates
    const dates = this.getDateRange(found.from_date, found.to_date, "days")

    const dateRange = this.splitArrayOfDates(dates, delDate); // takes array of dates and split it into two array always

    await this.deleteDate(found.from_date);

    /**
     * It will take two array of dates and save into db from 0th 
     * index value as first date and last index value as last date of both arrays
     * according their type for single date type is 1 and different date range type is 2
     **/
    await this.compareAndInsertDate(dateRange.one, dateRange.two, "date_type")
  }

  async insertBlockedDates(dateInput) {
    let { startDate, endDate, fTime, tTime } = dateInput;

    if(!startDate){
      return new Error("Please enter a valid block date");
    }

    try {
      const found = await (await this.dateHasFound(startDate)).found[0]; 

      //update the date b/w date type 1 and 3
      if(found.date_type === 3 || found.date_type === 1){
        await this.deleteDate(found.from_date)
      }else if(found.date_type === 2){
        await this.deleteDate(found.from_date)
      }
    } catch (error) {
      //it will empty intentionally if try block won't executed then the other code should not block
    }

    //if only containing start date
    if(!endDate){

      if(startDate && !fTime){
        endDate = startDate;
        await this.insertDateAndType(startDate, endDate, "date_type", 1);
      }
      
      if(startDate && fTime){
        const tempStartDate = startDate;
        startDate = `${startDate} ${moment(fTime).format("HH:mm")}`;
        endDate = `${tempStartDate} ${moment(tTime).format("HH:mm")}`;
        await this.insertDateAndType(startDate, endDate, "date_type", 3);
      }
      
      const dateWithFromTimeToTime = {dates: [{date: startDate}], time: [{fTime, tTime}]}

      return dateWithFromTimeToTime; //returning data gql format
    }

    await this.insertDateAndType(startDate, endDate, "date_type", 2);

    const date = [{date: `${startDate} ${endDate}`}];
    return {dates: date, time: [{fTime, tTime}]}
  }

  //this fun() will return array of single date and range of date
  async getBlockedDates() {

    let query = await this.compareAndGetDates("<",null,null)
  
    const findDateByType = query.map(date => this.getDateRange(date.from_date, date.to_date, "days")); //get obj val and returning a new array
    
    query = await this.compareAndGetDates("=",null,null)
    
    let singleAndRangeDates = findDateByType.flat();

    query = query.map((date) => {
      return date.from_date.split(" ")[0];
    })

    const dates = singleAndRangeDates.map((d) => {
      return {
        date: d,
      };
    });

    return { 
      dates: dates, 
      singleAndRangeDates, //for only getting data (not related to api integration)
      dateWithTime: query
    }; //returning data gql format
  }
}
