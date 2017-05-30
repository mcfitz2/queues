from datetime import datetime, date
import schedule
import requests, time
from bs4 import BeautifulSoup
from pymongo import MongoClient
from bson.binary import Binary
import os, json
import paho.mqtt.client as mqtt


LOGIN_PAGE = 'https://agateway.adp.com/siteminderagent/nocert/1452983272/smgetcred.scc?TYPE=16777217&REALM=-SM-iPay%20AG%20User%20[17%3a27%3a52%3a5835]&SMAUTHREASON=0&METHOD=GET&SMAGENTNAME=-SM-GJhM6kK9dRSj%2f%2fJIOxL2bk7urD4vemiZfubVBGrLAGxU0tnw7leGxGsIKs2LWyPV&TARGET=-SM-http%3a%2f%2fipay%2eadp%2ecom%2fiPay%2fprivate%2findex%2ejsf'
name = "ADP PayStub"

class Scraper():
    def __init__(self, userId, username, password, db):
        self.s = requests.session()
        self.username = username
        self.password = password
        self.db = db
        self.userId = userId
        self._login()

    def _login(self):

        url_split = LOGIN_PAGE.split('https://')
        l_page = 'https://' + self.username + ':' + self.password + '@' + url_split[1]

        # Submit creds via basic auth
        self.res = self.s.get(l_page)

        # Redirect to index
        self.res = self.s.get('https://ipay.adp.com/iPay/index.jsf')

        # Submit hidden form
        login_url = 'https://ipay.adp.com/iPay/login.jsf'
        data = {'normalLogin': 'yes'}
        self.res = self.s.post(login_url, data=data)

        # Redirect to private index
        self.res = self.s.get('https://ipay.adp.com/iPay/private/index.jsf')

        # Go to first year
        statement_html = self._get_statement_html()
        viewState = statement_html.find('input', attrs={'name': 'javax.faces.ViewState', 'type': 'hidden'}).get('value')
        data = {
            'statement': 'statement',
            'statement': 'changeStatementsType:1',
            'javax.faces.ViewState': viewState,
            'statement:year1': 'statement:year1'
        }

        year_url = 'https://ipay.adp.com/iPay/private/listDoc.jsf'
        self.res = self.s.post(year_url, data=data)


    def _set_statement_year(self, year, viewState):

        data = {
            'statement': 'statement',
            'statement:changeYear': 'year' + str(year),
            'javax.faces.ViewState': viewState
        }

        year_url = 'https://ipay.adp.com/iPay/private/listDoc.jsf'
        self.res = self.s.post(year_url, data=data)

    def _get_statement_html(self):

        # View statement history
        #try:
        statement_url = BeautifulSoup(self.res.text, 'html.parser').findAll('frame')[0].get('src')
        #except IndexError:
        #    print(self.res.text)
        #    if (self.res.status_code == 401):
        #        raise Exception("Unauthorized")
       # statement_url = BeautifulSoup(self.res.text, 'html.parser').findAll('frame')[0].get('src')
        self.res = self.s.get('https://ipay.adp.com' + statement_url)
        statement_html = BeautifulSoup(self.res.text, 'html.parser')

        return statement_html
    def _scrape_table(self, table_body, drive_date, viewState):

        rows = table_body.find_all('tr')
        row_count = 0
        for row in rows:
            cols = row.find_all('td')
            date_raw = cols[0].find('a').text
            statement_date = datetime.strptime(date_raw, "%m/%d/%Y").date()

            # Break when dates match
            if statement_date <= drive_date:
                return True

            # Download statement
            proxy_url = 'https://ipay.adp.com/iPay/private/listDoc.jsf'
            data = {'statement': 'statement', 'statement:changeStatementsType': '1',
                    'javax.faces.ViewState': viewState,
                    'statement:checks:' + str(row_count) + ':view': 'statement:checks:' + str(row_count) + ':view'}

            self.res = self.s.post(proxy_url, data=data)
            statement_url = BeautifulSoup(self.res.text, 'html.parser').findAll('iframe')[0].get('src')

            file = self.s.get('https://ipay.adp.com' + statement_url)
            document = {
                "pdf": Binary(file.content),
                "date": datetime.combine(statement_date, datetime.min.time()),
                "user":self.userId
            }
            existing = self.db.PayStubs.find_one({"date": document["date"], "user":self.userId})
            if not existing:
                self.db.PayStubs.insert_one(document)
            #self.dbx.files_upload(file.content, "/Scraper/ADP/"+str(statement_date)+'.pdf', mode=WriteMode('add', None))
            row_count += 1

        return False

    def scrape(self, drive_date):

        statement_html = BeautifulSoup(self.res.text, 'html.parser')

        viewState = statement_html.find('input', attrs={'name': 'javax.faces.ViewState', 'type': 'hidden'}).get('value')

        # Grab 'year' columns
        years = statement_html.find('table', id='statement:changeYear').find('tr').find_all('td')

        for col in years:
            year = col.find('input').get('value').split('r')[1]
            if (col.find('input').get('checked') is None):
                self._set_statement_year(year, viewState)

            statement_html = BeautifulSoup(self.res.text, 'html.parser')

            table = statement_html.find('table', id='statement:checks')
            table_body = table.find_all('tbody')[1]

            if (self._scrape_table(table_body, drive_date, viewState)):
                break

        return

    def hasNew(self, account, date):

        statement_html = BeautifulSoup(self.res.text, 'html.parser')
        table = statement_html.find('table', id='statement:checks')
        table_body = table.find_all('tbody')[1]

        rows = table_body.find_all('tr')
        cols = rows[0].find_all('td')
        date_raw = cols[0].find('a').text
        latest_date = datetime.strptime(date_raw, "%m/%d/%Y").date()

        if latest_date > date:
            print("New statement(s) found")
            return True
        else:
            print("No new statement(s) found")
            return False
def job():
    mq_client = mqtt.Client()
    mq_client.connect("mqtt", 1883, 60)
    mq_client.publish(os.environ["MQTT_BASE_TOPIC"], json.dumps({"job_name":"adp", "status":"starting"}))
    client = MongoClient("mongodb://db/dw")
    db = client.dw
    users = db.users.find()
    for user in users:
        docs = list(db.PayStubs.find({"user":user["_id"]}).sort([("date", -1)]).limit(1));
        s = Scraper(user["_id"], user["credentials"]["adp"]["username"], user["credentials"]["adp"]["password"], db)
        if len(docs) == 0:
            s.scrape(date(2000, 1, 1))
        else:
            s.scrape(docs[0]["date"].date())
    mq_client.publish(os.environ["MQTT_BASE_TOPIC"], json.dumps({"job_name":"adp", "status":"done"}))

job()
schedule.every().day.at("8:00").do(job)
while 1:
    schedule.run_pending()
    time.sleep(1)
