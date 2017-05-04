# queues

Queues is a tool that I setup so that I could archive all the digital aspects of my life. Social media posts, location info (from Moves), vehicle info (from Automatic), and more in the future. 

It's also an experiment to help me learn how to use Docker, deploy code in containers, and work with ES6 concepts. 

The project is split up into a number of Docker containers that can be started using Docker Compose. Each container is either for infrastructure or is an ETL process to extract and massage the data which is stored in MongoDB. The extract-* containers will pull data from primary sources and then any number of dependent processes will run to enrich the data. Eventually there will be a reporting component so I can get insights into my personal data. 

