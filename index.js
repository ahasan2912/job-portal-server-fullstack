require('dotenv').config()
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors(
  {
    origin: [
      'http://localhost:5173',
      'https://job-portal-application-5fee1.web.app',
      'https://job-portal-application-5fee1.firebaseapp.com'
    ],
    credentials: true
  }
));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log('token inside the verifyToken', token)

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  //verify the token
  jwt.verify(token, process.env.JWT_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  })
}

const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.PASS_DB}@cluster0.w0iow.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    console.log("Pinged your deployment. You successfully connected to MongoDB!");


    const jobCollection = client.db('jobPortal').collection('jobs');
    const jobApplicationCollection = client.db('jobPortal').collection('job_applications');

    //auth related api by jwt token
    app.post('/jwt', (req, res) => {
      const user = req.body; //payload
      const token = jwt.sign(user, process.env.JWT_TOKEN, { expiresIn: '5h' });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })
        .send({ success: true });
    })

    //when user logout jwt token autometic clear
    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })
        .send({ success: 'Logout successful' })
    })

    //job related api
    app.get('/jobs', async (req, res) => {
      //Recruiter email.
      const email = req.query.email;
      const sort = req.query?.sort;
      const search = req.query?.search;
      const min = req.query?.min;
      const max= req.query?.max;

      console.log(req.query)
      let quary = {};
      let sortQuery = {};

      if (email) {
        quary = { hr_email: email }
      }

      if (sort === "true") {
        sortQuery = {"salaryRange.min" : -1}
      }

      if(search){
        quary.location={$regex:search, $options: 'i'}
      }

      if(min && max){
        quary = {
          ...quary,
          "salaryRange.min": {$gte: parseInt(min)},
          "salaryRange.max": {$lte: parseInt(max)},
        }
      }

      const cursor = jobCollection.find(quary).sort(sortQuery);
      // const cursor = jobCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const result = await jobCollection.findOne(quary);
      res.send(result);
    })

    app.post('/jobs', async (req, res) => {
      const newJob = req.body;
      const result = await jobCollection.insertOne(newJob);
      res.send(result);
    })

    //job application   //get by email
    app.get('/job-application', verifyToken, async (req, res) => {
      const email = req.query.email;
      const quary = { applicant_email: email };

      // console.log(req.cookies) show infomation client

      //token email !== query email
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const cursor = jobApplicationCollection.find(quary);
      const result = await cursor.toArray();

      //fokira way to aggregate data 
      //Each users application list
      for (const application of result) {
        const query1 = { _id: new ObjectId(application.job_id) }
        const job = await jobCollection.findOne(query1);
        //if find job then itregate three title, company, logo
        if (job) {
          application.title = job.title;
          application.company = job.company;
          application.company_logo = job.company_logo;
        }
      }
      res.send(result);
    })

    app.get('/job-application/jobs/:job_id', async (req, res) => {
      const jobId = req.params.job_id;
      const quary = { job_id: jobId }
      const result = await jobApplicationCollection.find(quary).toArray();
      res.send(result);

    })

    app.post('/job-application', async (req, res) => {
      const application = req.body;
      const rusult = await jobApplicationCollection.insertOne(application);

      //not the best way (use aggregate)
      //skip --> it 
      const id = application.job_id;
      const query = { _id: new ObjectId(id) };
      const job = await jobCollection.findOne(query);
      let newCount = 0;
      if (job.applicationCount) {
        newCount += job.applicationCount;
      }
      else {
        newCount = 1;
      }

      // now update the job info

      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          applicationCount: newCount
        }
      }

      const updatedResult = await jobCollection.updateOne(filter, updatedDoc);

      res.send(rusult);
    })

    app.patch('/job-applications/:id', async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: data.status
        }
      }
      const result = await jobApplicationCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Job portal application running");
})

app.listen(port, () => {
  console.log("Job portal running ", port);
})

